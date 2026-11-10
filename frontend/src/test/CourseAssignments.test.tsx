import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CourseAssignments from '../components/CourseAssignments'
import { jsonResponse } from './helpers'

// Test the real role/deadline decisions in CourseAssignments, but replace
// child components with clear markers. Other tests exercise the actual children.
vi.mock('../components/AssignmentGrading', () => ({
  default: () => <div data-testid="professor-grading" />,
}))
vi.mock('../components/AssignmentAttemptReviewPanel', () => ({
  default: () => <div data-testid="attempt-history" />,
}))
vi.mock('../components/CreateAssignmentForm', () => ({
  default: () => <div data-testid="create-assignment" />,
}))
vi.mock('../components/EditAssignmentForm', () => ({
  default: () => <div data-testid="edit-assignment" />,
}))
vi.mock('../components/AssignmentSubmissionForm', () => ({
  default: () => <div data-testid="student-edit" />,
}))
vi.mock('../components/AddNewSubmissionForm', () => ({
  default: () => <div data-testid="new-attempt" />,
}))
vi.mock('../components/FinalSubmissionSummary', () => ({
  default: () => <div data-testid="final-summary" />,
}))

function stubAssignmentApi(options: {
  role: 'student' | 'professor' | 'admin'
  multiple?: boolean
  pastDeadline?: boolean
  withSubmission?: boolean
}) {
  const deadline = new Date(
    Date.now() + (options.pastDeadline ? -24 : 24) * 3600 * 1000,
  ).toISOString()
  const assignment = {
    id: 3,
    course_id: 1,
    title: 'Course final project',
    description: null,
    instructions: null,
    due_at: deadline,
    max_score: 100,
    created_at: '2026-11-01T12:00:00Z',
    allow_multiple_submissions: options.multiple ?? false,
  }
  const fetchMock = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
    if (String(url) === '/api/assignments/courses/1') return jsonResponse([assignment])
    if (String(url) === '/api/submissions/my-submissions') {
      return jsonResponse(options.withSubmission ? [{ id: 15, assignment_id: 3, student_id: 7 }] : [])
    }
    throw new Error(`Unexpected mocked URL: ${String(url)}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function openAssignmentDetails() {
  const button = await screen.findByRole('button', { name: 'View details' })
  await userEvent.click(button)
}

describe('CourseAssignments roles and deadline controls', () => {
  it('keeps assignment details collapsed until an assignment is selected', async () => {
    stubAssignmentApi({ role: 'student', withSubmission: true })
    render(<CourseAssignments courseId={1} token="test-token" role="student" />)
    const open = await screen.findByRole('button', { name: 'View details' })
    expect(open.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('student-edit')).not.toBeInTheDocument()
    await userEvent.click(open)
    expect(screen.getByTestId('student-edit')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Hide details' }))
    expect(screen.queryByTestId('student-edit')).not.toBeInTheDocument()
  })

  it('opens the focused assignment when navigating from the dashboard', async () => {
    stubAssignmentApi({ role: 'student', withSubmission: true })
    render(<CourseAssignments courseId={1} token="test-token" role="student" focusRequest={{ assignmentId: 3 }} />)
    expect(await screen.findByTestId('student-edit')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide details' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('shows edit and new-attempt controls for a student with Multiple Submissions before the deadline', async () => {
    stubAssignmentApi({ role: 'student', multiple: true, withSubmission: true })
    render(<CourseAssignments courseId={1} token="test-token" role="student" />)
    await openAssignmentDetails()

    expect(await screen.findByTestId('student-edit')).toBeInTheDocument()
    expect(screen.getByTestId('new-attempt')).toBeInTheDocument()
    expect(screen.getByTestId('attempt-history')).toBeInTheDocument()
    expect(screen.queryByTestId('professor-grading')).not.toBeInTheDocument()
    expect(screen.queryByTestId('create-assignment')).not.toBeInTheDocument()
  })

  it('never shows Add New Submission for Single Submission policy', async () => {
    stubAssignmentApi({ role: 'student', multiple: false, withSubmission: true })
    render(<CourseAssignments courseId={1} token="test-token" role="student" />)
    await openAssignmentDetails()

    expect(await screen.findByTestId('student-edit')).toBeInTheDocument()
    expect(screen.queryByTestId('new-attempt')).not.toBeInTheDocument()
  })

  it('shows read-only final summary after the deadline, with no edit or new attempt', async () => {
    stubAssignmentApi({ role: 'student', multiple: true, pastDeadline: true, withSubmission: true })
    render(<CourseAssignments courseId={1} token="test-token" role="student" />)
    await openAssignmentDetails()

    expect(await screen.findByTestId('final-summary')).toBeInTheDocument()
    expect(screen.queryByTestId('student-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('new-attempt')).not.toBeInTheDocument()
    expect(screen.getByTestId('attempt-history')).toBeInTheDocument()
  })

  it('lets a professor comment before the deadline but hides final grading', async () => {
    stubAssignmentApi({ role: 'professor', pastDeadline: false })
    render(<CourseAssignments courseId={1} token="test-token" role="professor" />)
    await openAssignmentDetails()

    expect(await screen.findByTestId('attempt-history')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'New assignment' }))
    expect(screen.getByTestId('create-assignment')).toBeInTheDocument()
    expect(screen.queryByTestId('professor-grading')).not.toBeInTheDocument()
    expect(screen.getByText(/final grading opens after the assignment deadline/i)).toBeInTheDocument()
  })

  it('shows professor final grading after the deadline', async () => {
    stubAssignmentApi({ role: 'professor', pastDeadline: true })
    render(<CourseAssignments courseId={1} token="test-token" role="professor" />)
    await openAssignmentDetails()

    expect(await screen.findByTestId('professor-grading')).toBeInTheDocument()
    expect(screen.getByTestId('attempt-history')).toBeInTheDocument()
  })

  it('allows an administrator to see final grading after the deadline', async () => {
    stubAssignmentApi({ role: 'admin', pastDeadline: true })
    render(<CourseAssignments courseId={1} token="test-token" role="admin" />)
    await openAssignmentDetails()

    expect(await screen.findByTestId('professor-grading')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'New assignment' }))
    expect(screen.getByTestId('create-assignment')).toBeInTheDocument()
  })
})
