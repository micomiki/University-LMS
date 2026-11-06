
import { useEffect, useState } from 'react'
import AssignmentGrading from './AssignmentGrading'
import CreateAssignmentForm from './CreateAssignmentForm'
import AssignmentSubmissionForm, {
  type StudentSubmission,
} from './AssignmentSubmissionForm'

type Assignment = {
  id: number
  course_id: number
  title: string
  description: string | null
  instructions: string | null
  due_at: string
  max_score: number | string
  created_at: string
}

type Props = {
  courseId: number
  token: string
  role: string
}

async function readError(response: Response): Promise<string> {
  const data = await response.json().catch(() => null)

  return typeof data?.detail === 'string'
    ? data.detail
    : `Request failed (${response.status}).`
}

export default function CourseAssignments({
  courseId,
  token,
  role,
}: Props) {
  const [assignments, setAssignments] =
    useState<Assignment[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [submissions, setSubmissions] =
    useState<StudentSubmission[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  const isStudent = role.toLowerCase() === 'student'
  const canGrade =
  role.toLowerCase() === 'professor' ||
  role.toLowerCase() === 'admin'
  async function refreshSubmissions() {
    if (!isStudent) return

    const response = await fetch(
      '/api/submissions/my-submissions',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(await readError(response))
    }

    const data: StudentSubmission[] = await response.json()
    setSubmissions(data)
  }

  useEffect(() => {
    const controller = new AbortController()

    async function loadAssignments() {
      setLoading(true)
      setError('')
      setAssignments([])
      setSubmissions([])

      try {
        const headers = {
          Authorization: `Bearer ${token}`,
        }

        const assignmentRequest = fetch(
          `/api/assignments/courses/${courseId}`,
          {
            headers,
            signal: controller.signal,
          }
        )

        const submissionRequest = isStudent
          ? fetch('/api/submissions/my-submissions', {
              headers,
              signal: controller.signal,
            })
          : Promise.resolve(null)

        const [assignmentResponse, submissionResponse] =
          await Promise.all([
            assignmentRequest,
            submissionRequest,
          ])

        if (!assignmentResponse.ok) {
          throw new Error(
            await readError(assignmentResponse)
          )
        }

        const assignmentData: Assignment[] =
          await assignmentResponse.json()

        let submissionData: StudentSubmission[] = []

        if (submissionResponse) {
          if (!submissionResponse.ok) {
            throw new Error(
              await readError(submissionResponse)
            )
          }

          submissionData = await submissionResponse.json()
        }

        if (!controller.signal.aborted) {
          setAssignments(
            [...assignmentData].sort(
              (a, b) =>
                new Date(a.due_at).getTime() -
                new Date(b.due_at).getTime()
            )
          )

          setSubmissions(submissionData)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load assignments.'
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadAssignments()

    return () => controller.abort()
  }, [courseId, token, isStudent, refreshKey])

  return (
    <section className="panel">
      <h2>Course Assignments</h2>

      <p>
        View instructions, submit your work,
        and check your grades.
      </p>
{(role.toLowerCase() === 'professor' ||
  role.toLowerCase() === 'admin') && (
  <CreateAssignmentForm
    key={courseId}
    courseId={courseId}
    token={token}
    onCreated={() => setRefreshKey((n) => n + 1)}
  />
)}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p>Loading assignments...</p>
      ) : assignments.length === 0 ? (
        !error && <p>No assignments available.</p>
      ) : (
        <div className="assignments-list">
          {assignments.map((assignment) => {
            const submission = submissions.find(
              (item) =>
                item.assignment_id === assignment.id
            ) ?? null

            const pastDeadline =
              new Date(assignment.due_at).getTime() <
              Date.now()

            return (
              <article
                key={assignment.id}
                className="assignment-card"
              >
                <div className="assignment-header">
                  <h3>{assignment.title}</h3>

                  <span
                    className={
                      pastDeadline
                        ? 'assignment-status overdue'
                        : 'assignment-status open'
                    }
                  >
                    {pastDeadline
                      ? 'Past deadline'
                      : 'Upcoming'}
                  </span>
                </div>

                {assignment.description && (
                  <p>{assignment.description}</p>
                )}

                {assignment.instructions && (
                  <div className="assignment-instructions">
                    <strong>Instructions</strong>
                    <p>{assignment.instructions}</p>
                  </div>
                )}

                <div className="assignment-details">
                  <p>
                    <strong>Deadline:</strong>{' '}
                    {new Date(
                      assignment.due_at
                    ).toLocaleString()}
                  </p>

                  <p>
                    <strong>Maximum Score:</strong>{' '}
                    {assignment.max_score}
                  </p>
                </div>

                {isStudent && (
                  <AssignmentSubmissionForm
                    key={assignment.id}
                    assignmentId={assignment.id}
                    token={token}
                    existing={submission}
                    onSubmitted={refreshSubmissions}
                  />
                )}

                {/* Professor grading section */}
{canGrade && (
  <AssignmentGrading
    assignmentId={assignment.id}
    maxScore={assignment.max_score}
    token={token}
  />
)}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
