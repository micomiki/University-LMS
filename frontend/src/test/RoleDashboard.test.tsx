import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RoleDashboard, {
  buildProfessorDashboardRows,
  buildStudentDashboardRows,
  isPendingFinalGrade,
  type DashboardAssignment,
  type DashboardCourse,
  type DashboardSubmission,
} from '../components/RoleDashboard'

const course: DashboardCourse = { id: 1, title: 'Software Engineering', course_code: 'SWE101' }
const otherCourse: DashboardCourse = { id: 2, title: 'Other Course', course_code: 'OTH101' }
const early: DashboardAssignment = {
  id: 11, course_id: 1, title: 'Project 1', due_at: '2099-11-30T12:00:00Z', max_score: 100,
}
const closed: DashboardAssignment = {
  id: 12, course_id: 1, title: 'Project 2', due_at: '2020-01-01T12:00:00Z', max_score: 100,
}
const ownSubmission: DashboardSubmission = {
  id: 21, assignment_id: 12, student_id: 4,
  submitted_at: '2019-12-15T09:00:00Z', score: null,
}

function ok(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response
}

function mockFetch(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: string) => {
    if (!(input in routes)) return { ok: false, status: 404, json: async () => ({ detail: 'Not found' }) } as Response
    return ok(routes[input])
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('RoleDashboard data rules', () => {
  it('shows only assignments from the student\'s enrolled courses', () => {
    const rows = buildStudentDashboardRows(
      [course, otherCourse], [{ id: 9, course_id: 1, student_id: 4 }],
      [early, { ...early, id: 99, course_id: 2 }], [],
    )
    expect(rows.map((item) => item.assignment.id)).toEqual([11])
  })

  it('recognizes a zero score as graded', () => {
    const rows = buildStudentDashboardRows(
      [course], [{ id: 9, course_id: 1, student_id: 4 }], [closed],
      [{ ...ownSubmission, score: 0 }],
    )
    expect(rows[0].status).toBe('graded')
  })

  it('identifies missing and awaiting-grading assignments', () => {
    const enrollment = [{ id: 9, course_id: 1, student_id: 4 }]
    const missing = buildStudentDashboardRows([course], enrollment, [closed], [])
    const pending = buildStudentDashboardRows([course], enrollment, [closed], [ownSubmission])
    expect(missing[0].status).toBe('missing')
    expect(pending[0].status).toBe('under-review')
  })

  it('only includes professor submissions whose assignments are in supplied courses', () => {
    const rows = buildProfessorDashboardRows(
      [course], [closed, { ...early, id: 99, course_id: 2 }],
      [ownSubmission, { ...ownSubmission, id: 98, assignment_id: 99 }],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].submission.id).toBe(21)
  })

  it('allows final grading only after the deadline and when score is null', () => {
    const [row] = buildProfessorDashboardRows([course], [closed], [ownSubmission])
    expect(isPendingFinalGrade(row, Date.parse('2021-01-01T00:00:00Z'))).toBe(true)
    expect(isPendingFinalGrade(row, Date.parse('2019-01-01T00:00:00Z'))).toBe(false)
    expect(isPendingFinalGrade({ ...row, submission: { ...ownSubmission, score: 0 } })).toBe(false)
  })
})

describe('RoleDashboard UI', () => {
  it('loads enrolled student assignments and opens the selected assignment', async () => {
    mockFetch({
      '/api/enrollments/': [{ id: 9, course_id: 1, student_id: 4 }],
      '/api/submissions/my-submissions': [],
      '/api/assignments/courses/1': [early],
    })
    const navigate = vi.fn()
    render(<RoleDashboard role="STUDENT" token="test-token" courses={[course, otherCourse]} onOpenAssignment={navigate} />)
    expect(await screen.findByText('Project 1')).toBeTruthy()
    expect(screen.queryByText('Other Course')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Open assignment' }))
    expect(navigate).toHaveBeenCalledWith(1, 11, undefined)
  })

  it('shows a professor\'s grading queue for work past deadline', async () => {
    mockFetch({
      '/api/assignments/courses/1': [closed],
      '/api/submissions/assignments/12': [ownSubmission],
    })
    render(<RoleDashboard role="PROFESSOR" token="test-token" courses={[course]} onOpenAssignment={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: 'Final grading queue' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open grading' })).toBeTruthy()
    expect(screen.getAllByText('Student #4', { exact: false }).length).toBeGreaterThan(0)
  })

  it('reports API errors and can retry', async () => {
    const fetchMock = mockFetch({
      '/api/enrollments/': [{ id: 9, course_id: 1, student_id: 4 }],
      '/api/submissions/my-submissions': [],
    })
    render(<RoleDashboard role="STUDENT" token="test-token" courses={[course]} onOpenAssignment={vi.fn()} />)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Not found')
    await userEvent.click(screen.getByRole('button', { name: 'Refresh dashboard' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6))
  })
})
