import { useEffect, useState } from 'react'
import AssignmentProgressBadge, {
  getAssignmentProgress,
  type AssignmentProgressStatus,
} from './AssignmentProgress'
import './RoleDashboard.css'

export type DashboardCourse = {
  id: number
  title: string
  course_code: string
  description?: string | null
}

export type DashboardAssignment = {
  id: number
  course_id: number
  title: string
  due_at: string
  max_score: number | string
}

type DashboardEnrollment = {
  id: number
  course_id: number
  student_id: number
}

export type DashboardSubmission = {
  id: number
  assignment_id: number
  student_id: number
  submitted_at: string
  score: number | string | null
  graded_at?: string | null
  feedback?: string | null
}

export type StudentDashboardRow = {
  assignment: DashboardAssignment
  course: DashboardCourse
  submission: DashboardSubmission | null
  status: AssignmentProgressStatus
}

export type ProfessorDashboardRow = {
  assignment: DashboardAssignment
  course: DashboardCourse
  submission: DashboardSubmission
}

export function buildStudentDashboardRows(
  courses: DashboardCourse[],
  enrollments: DashboardEnrollment[],
  assignments: DashboardAssignment[],
  submissions: DashboardSubmission[],
  now = Date.now(),
): StudentDashboardRow[] {
  const enrolledCourseIds = new Set(enrollments.map((item) => item.course_id))
  const courseById = new Map(
    courses.filter((course) => enrolledCourseIds.has(course.id))
      .map((course) => [course.id, course] as const),
  )
  const submissionByAssignment = new Map(
    submissions.map((submission) => [submission.assignment_id, submission] as const),
  )

  return assignments.flatMap((assignment) => {
    const course = courseById.get(assignment.course_id)
    if (!course) return []
    const submission = submissionByAssignment.get(assignment.id) ?? null
    return [{
      assignment,
      course,
      submission,
      status: getAssignmentProgress(assignment.due_at, submission, now),
    }]
  })
}

export function buildProfessorDashboardRows(
  courses: DashboardCourse[],
  assignments: DashboardAssignment[],
  submissions: DashboardSubmission[],
): ProfessorDashboardRow[] {
  const courseById = new Map(courses.map((course) => [course.id, course] as const))
  const assignmentById = new Map(assignments.map((item) => [item.id, item] as const))
  return submissions.flatMap((submission) => {
    const assignment = assignmentById.get(submission.assignment_id)
    const course = assignment && courseById.get(assignment.course_id)
    return assignment && course ? [{ assignment, course, submission }] : []
  })
}

export function isPendingFinalGrade(row: ProfessorDashboardRow, now = Date.now()) {
  return Date.parse(row.assignment.due_at) <= now &&
    row.submission.score === null
}

type DashboardData = {
  enrollments: DashboardEnrollment[]
  assignments: DashboardAssignment[]
  submissions: DashboardSubmission[]
}

type Props = {
  role: string
  token: string
  courses: DashboardCourse[]
  onOpenAssignment: (courseId: number, assignmentId: number, submissionId?: number) => void
}

async function getJson<T>(path: string, token: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (!response.ok) {
    const payload: { detail?: unknown } | null = await response.json().catch(() => null)
    const message = typeof payload?.detail === 'string'
      ? payload.detail
      : `Request failed (${response.status})`
    throw new Error(message)
  }
  return (await response.json()) as T
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rd-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatDate(date: string) {
  return new Date(date).toLocaleString()
}

export default function RoleDashboard({ role, token, courses, onOpenAssignment }: Props) {
  const normalizedRole = role.toLowerCase()
  const isStudent = normalizedRole === 'student'
  const isProfessor = normalizedRole === 'professor'
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!isStudent && !isProfessor) {
      setLoading(false)
      return
    }
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError('')
      try {
        if (isStudent) {
          // /api/courses/ contains the complete catalogue for students.
          // Only fetch assignments for courses in their own enrollment list.
          const [enrollments, submissions] = await Promise.all([
            getJson<DashboardEnrollment[]>('/api/enrollments/', token, controller.signal),
            getJson<DashboardSubmission[]>('/api/submissions/my-submissions', token, controller.signal),
          ])
          const enrolledIds = new Set(enrollments.map((item) => item.course_id))
          const assignedCourses = courses.filter((course) => enrolledIds.has(course.id))
          const perCourse = await Promise.all(assignedCourses.map((course) =>
            getJson<DashboardAssignment[]>(
              `/api/assignments/courses/${course.id}`, token, controller.signal,
            ),
          ))
          if (!controller.signal.aborted) {
            setData({ enrollments, assignments: perCourse.flat(), submissions })
          }
        } else {
          // The course API already restricts professors to their assigned courses.
          const perCourse = await Promise.all(courses.map((course) =>
            getJson<DashboardAssignment[]>(
              `/api/assignments/courses/${course.id}`, token, controller.signal,
            ),
          ))
          const assignments = perCourse.flat()
          const perAssignment = await Promise.all(assignments.map((assignment) =>
            getJson<DashboardSubmission[]>(
              `/api/submissions/assignments/${assignment.id}`, token, controller.signal,
            ),
          ))
          if (!controller.signal.aborted) {
            setData({ enrollments: [], assignments, submissions: perAssignment.flat() })
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setData(null)
          setError(err instanceof Error ? err.message : 'Unable to load dashboard.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [isStudent, isProfessor, token, courses, reloadKey])

  if (!isStudent && !isProfessor) return null

  const studentRows = isStudent && data
    ? buildStudentDashboardRows(
        courses, data.enrollments, data.assignments, data.submissions, now,
      )
    : []
  const professorRows = isProfessor && data
    ? buildProfessorDashboardRows(courses, data.assignments, data.submissions)
    : []

  const dueSoon = studentRows.filter((row) =>
    row.status === 'not-submitted' &&
    Date.parse(row.assignment.due_at) > now &&
    Date.parse(row.assignment.due_at) <= now + 7 * 24 * 60 * 60 * 1000,
  )
  const upcoming = studentRows.filter((row) => Date.parse(row.assignment.due_at) > now)
    .sort((a, b) => Date.parse(a.assignment.due_at) - Date.parse(b.assignment.due_at))
    .slice(0, 8)
  const graded = studentRows.filter((row) => row.status === 'graded')
    .sort((a, b) => Date.parse(b.submission?.graded_at ?? b.submission?.submitted_at ?? '') -
      Date.parse(a.submission?.graded_at ?? a.submission?.submitted_at ?? ''))
    .slice(0, 5)
  const pendingGrades = professorRows.filter((row) => isPendingFinalGrade(row, now))
    .sort((a, b) => Date.parse(a.assignment.due_at) - Date.parse(b.assignment.due_at))
  const recentWork = [...professorRows]
    .sort((a, b) => Date.parse(b.submission.submitted_at) - Date.parse(a.submission.submitted_at))
    .slice(0, 8)

  return (
    <section className="role-dashboard" aria-label={isStudent ? 'Student dashboard' : 'Professor dashboard'}>
      <div className="rd-heading">
        <div>
          <h2>{isStudent ? 'My learning overview' : 'Teaching overview'}</h2>
          <p>{isStudent ? 'Deadlines, submissions and results across your enrolled courses.'
            : 'Assignments awaiting final grades and recently submitted student work.'}</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setReloadKey((n) => n + 1)} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh dashboard'}
        </button>
      </div>

      {error && <p role="alert" className="error">{error}</p>}
      {loading && <p role="status">Loading dashboard...</p>}

      {!loading && data && isStudent && (
        <>
          <div className="rd-metrics">
            <Metric label="Enrolled courses" value={courses.filter((course) =>
              data.enrollments.some((item) => item.course_id === course.id)).length} />
            <Metric label="Due within 7 days (not submitted)" value={dueSoon.length} />
            <Metric label="Awaiting final grading" value={studentRows.filter((row) => row.status === 'under-review').length} />
            <Metric label="Graded assignments" value={studentRows.filter((row) => row.status === 'graded').length} />
          </div>
          <div className="rd-sections">
            <section className="rd-panel" aria-labelledby="rd-deadlines">
              <h3 id="rd-deadlines">Upcoming deadlines</h3>
              {upcoming.length === 0 ? <p>No upcoming deadlines in your enrolled courses.</p> : (
                <div className="rd-list">
                  {upcoming.map((row) => (
                    <article className="rd-item" key={row.assignment.id}>
                      <div>
                        <strong>{row.assignment.title}</strong>
                        <p>{row.course.course_code} · {formatDate(row.assignment.due_at)}</p>
                        <AssignmentProgressBadge status={row.status} />
                      </div>
                      <button type="button" className="btn-secondary" onClick={() => onOpenAssignment(row.course.id, row.assignment.id, row.submission?.id)}>
                        Open assignment
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className="rd-panel" aria-labelledby="rd-results">
              <h3 id="rd-results">Recent final grades</h3>
              {graded.length === 0 ? <p>No final grades published yet.</p> : (
                <div className="rd-list">
                  {graded.map((row) => (
                    <article className="rd-item" key={row.assignment.id}>
                      <div>
                        <strong>{row.assignment.title}</strong>
                        <p>{row.course.course_code} · Grade {row.submission?.score} / {row.assignment.max_score}</p>
                      </div>
                      <button type="button" className="btn-secondary" onClick={() => onOpenAssignment(row.course.id, row.assignment.id, row.submission?.id)}>
                        View result
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
          {studentRows.some((row) => row.status === 'missing') && (
            <section className="rd-panel" aria-label="Missing assignments">
              <h3>Missing assignments</h3>
              <p>{studentRows.filter((row) => row.status === 'missing').length} assignment(s) closed without a submission.</p>
            </section>
          )}
        </>
      )}

      {!loading && data && isProfessor && (
        <>
          <div className="rd-metrics">
            <Metric label="Teaching courses" value={courses.length} />
            <Metric label="Assignments" value={data.assignments.length} />
            <Metric label="Awaiting final grades" value={pendingGrades.length} />
            <Metric label="Student submissions" value={professorRows.length} />
          </div>
          <div className="rd-sections">
            <section className="rd-panel" aria-labelledby="rd-grading">
              <h3 id="rd-grading">Final grading queue</h3>
              {pendingGrades.length === 0 ? <p>No submissions are currently awaiting final grades.</p> : (
                <div className="rd-list">
                  {pendingGrades.slice(0, 8).map((row) => (
                    <article className="rd-item" key={row.submission.id}>
                      <div>
                        <strong>{row.assignment.title}</strong>
                        <p>{row.course.course_code} · Student #{row.submission.student_id}</p>
                        <span className="rd-hint">Deadline passed · Grade pending</span>
                      </div>
                      <button type="button" className="btn-secondary" onClick={() => onOpenAssignment(row.course.id, row.assignment.id, row.submission?.id)}>
                        Open grading
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className="rd-panel" aria-labelledby="rd-recent">
              <h3 id="rd-recent">Recent submissions</h3>
              {recentWork.length === 0 ? <p>No submissions received yet.</p> : (
                <div className="rd-list">
                  {recentWork.map((row) => (
                    <article className="rd-item" key={row.submission.id}>
                      <div>
                        <strong>{row.assignment.title}</strong>
                        <p>{row.course.course_code} · Student #{row.submission.student_id}</p>
                        <span className="rd-hint">Received {formatDate(row.submission.submitted_at)}</span>
                      </div>
                      <button type="button" className="btn-secondary" onClick={() => onOpenAssignment(row.course.id, row.assignment.id, row.submission?.id)}>
                        Review work
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
          <p className="rd-note">Individual attempt comments are available inside each course's Assignments tab. The grading queue counts submissions, not unreviewed attempts.</p>
        </>
      )}
    </section>
  )
}
