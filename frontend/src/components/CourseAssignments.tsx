
import { useEffect, useState } from 'react'
import AssignmentGrading from './AssignmentGrading'
import AssignmentAttemptReviewPanel from './AssignmentAttemptReviewPanel'
import CreateAssignmentForm from './CreateAssignmentForm'
import EditAssignmentForm from './EditAssignmentForm'
import AddNewSubmissionForm from './AddNewSubmissionForm'
import FinalSubmissionSummary from './FinalSubmissionSummary'
import AssignmentProgressBadge, {
  getAssignmentProgress,
} from './AssignmentProgress'
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
  allow_multiple_submissions: boolean
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
  const [deletingAssignmentId, setDeletingAssignmentId] =
  useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingAssignmentId, setEditingAssignmentId] =
  useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
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


  
async function deleteAssignment(assignment: Assignment) {
  const confirmed = window.confirm(
    `Are you sure you want to delete "${assignment.title}"?\n\n` +
    'This action cannot be undone.'
  )

  if (!confirmed) return

  setDeletingAssignmentId(assignment.id)
  setError('')

  try {
    const response = await fetch(
      `/api/assignments/${assignment.id}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      const data = await response.json().catch(() => null)

      throw new Error(
        typeof data?.detail === 'string'
          ? data.detail
          : `Deletion failed (${response.status}).`
      )
    }

    setEditingAssignmentId(null)

    // Reload assignments from the backend.
    setRefreshKey((previous) => previous + 1)

  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Unable to delete assignment.'
    )
  } finally {
    setDeletingAssignmentId(null)
  }
}

useEffect(() => {
  const timer = window.setInterval(() => {
    setNow(Date.now())
  }, 15000)

  return () => window.clearInterval(timer)
}, [])
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
  new Date(assignment.due_at).getTime() <= now
const studentStatus = getAssignmentProgress(
  assignment.due_at,
  submission,
  now,
)
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
                  {isStudent && (
  <AssignmentProgressBadge status={studentStatus} />
)}
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
                
{/* Professor assignment editing */}

{/* Professor assignment management */}
{canGrade && (
  <div className="assignment-manage">

    {editingAssignmentId !== assignment.id && (
      <div className="assignment-manage-actions">

        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            setEditingAssignmentId(assignment.id)
          }
        >
          Edit Assignment
        </button>

        <button
          type="button"
          className="btn-danger"
          disabled={deletingAssignmentId !== null}
          onClick={() =>
            void deleteAssignment(assignment)
          }
        >
          {deletingAssignmentId === assignment.id
            ? 'Deleting...'
            : 'Delete Assignment'}
        </button>

      </div>
    )}

    {editingAssignmentId === assignment.id && (
      <EditAssignmentForm
        assignment={assignment}
        token={token}
        onSaved={() => {
          setEditingAssignmentId(null)
          setRefreshKey((n) => n + 1)
        }}
        onCancel={() =>
          setEditingAssignmentId(null)
        }
      />
    )}

  </div>
)}



                

          

{/* Student submission, final result and attempt history */}
{isStudent && (
  <>
    {!pastDeadline ? (
      <>
        <AssignmentSubmissionForm
          key={assignment.id}
          assignmentId={assignment.id}
          token={token}
          existing={submission}
          onSubmitted={refreshSubmissions}
        />

        {assignment.allow_multiple_submissions && submission && (
          <AddNewSubmissionForm
            assignmentId={assignment.id}
            token={token}
            onSubmitted={refreshSubmissions}
          />
        )}
      </>
    ) : submission ? (
      <FinalSubmissionSummary
        submissionId={submission.id}
        token={token}
        maxScore={assignment.max_score}
      />
    ) : (
      <p role="status">
        No submission was received before the deadline.
      </p>
    )}

    <AssignmentAttemptReviewPanel
      assignmentId={assignment.id}
      token={token}
      mode="student"
    />
  </>
)}

{/* Professor final grading and attempt feedback */}
{canGrade && (
  <>
    {pastDeadline ? (
      <AssignmentGrading
        assignmentId={assignment.id}
        maxScore={assignment.max_score}
        token={token}
      />
    ) : (
      <p role="status">
        Final grading opens after the assignment deadline.
        You can review and comment on attempts now.
      </p>
    )}

    <AssignmentAttemptReviewPanel
      assignmentId={assignment.id}
      token={token}
      mode={
        role.toLowerCase() === 'admin'
          ? 'admin'
          : 'professor'
      }
    />
  </>
)}

              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
