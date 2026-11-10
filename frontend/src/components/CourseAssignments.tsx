import { useEffect, useState } from 'react'
import AssignmentGrading from './AssignmentGrading'
import AssignmentAttemptReviewPanel from './AssignmentAttemptReviewPanel'
import CreateAssignmentForm from './CreateAssignmentForm'
import EditAssignmentForm from './EditAssignmentForm'
import AddNewSubmissionForm from './AddNewSubmissionForm'
import FinalSubmissionSummary from './FinalSubmissionSummary'
import AssignmentProgressBadge, { getAssignmentProgress } from './AssignmentProgress'
import AssignmentSubmissionForm, { type StudentSubmission } from './AssignmentSubmissionForm'
import './CourseAssignmentsCompact.css'

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

// A new object is supplied on every dashboard/notification navigation.
// This lets the same assignment be opened again after the user collapsed it.
export type AssignmentFocusRequest = {
  assignmentId: number
  submissionId?: number
}

type Props = {
  courseId: number
  token: string
  role: string
  focusRequest?: AssignmentFocusRequest | null
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
  focusRequest = null,
}: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([])
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<number | null>(null)
  const [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(null)
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const isStudent = role.toLowerCase() === 'student'
  const canGrade = role.toLowerCase() === 'professor' || role.toLowerCase() === 'admin'

  async function refreshSubmissions() {
    if (!isStudent) return
    const response = await fetch('/api/submissions/my-submissions', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw new Error(await readError(response))
    const data: StudentSubmission[] = await response.json()
    setSubmissions(data)
  }

  useEffect(() => {
    setSelectedAssignmentId(null)
    setEditingAssignmentId(null)
    setShowCreateForm(false)
  }, [courseId])

  useEffect(() => {
    const controller = new AbortController()
    async function loadAssignments() {
      setLoading(true)
      setError('')
      setAssignments([])
      setSubmissions([])

      try {
        const headers = { Authorization: `Bearer ${token}` }
        const assignmentRequest = fetch(`/api/assignments/courses/${courseId}`, {
          headers, signal: controller.signal,
        })
        const submissionRequest = isStudent
          ? fetch('/api/submissions/my-submissions', {
              headers, signal: controller.signal,
            })
          : Promise.resolve(null)
        const [assignmentResponse, submissionResponse] = await Promise.all([
          assignmentRequest, submissionRequest,
        ])
        if (!assignmentResponse.ok) throw new Error(await readError(assignmentResponse))
        const assignmentData: Assignment[] = await assignmentResponse.json()
        let submissionData: StudentSubmission[] = []
        if (submissionResponse) {
          if (!submissionResponse.ok) throw new Error(await readError(submissionResponse))
          submissionData = await submissionResponse.json()
        }
        if (!controller.signal.aborted) {
          setAssignments([...assignmentData].sort((a, b) =>
            Date.parse(a.due_at) - Date.parse(b.due_at),
          ))
          setSubmissions(submissionData)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unable to load assignments.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadAssignments()
    return () => controller.abort()
  }, [courseId, token, isStudent, refreshKey])

  // Focus the individual assignment, not merely the course Assignments tab.
  useEffect(() => {
    if (focusRequest && assignments.some((item) => item.id === focusRequest.assignmentId)) {
      setSelectedAssignmentId(focusRequest.assignmentId)
    }
  }, [focusRequest, assignments])

  useEffect(() => {
    if (!focusRequest || loading || selectedAssignmentId !== focusRequest.assignmentId) return
    document.getElementById(`assignment-${focusRequest.assignmentId}`)
      ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }, [focusRequest, loading, selectedAssignmentId])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [])

  function toggleAssignment(assignmentId: number) {
    setSelectedAssignmentId((current) => current === assignmentId ? null : assignmentId)
    setEditingAssignmentId(null)
  }

  async function deleteAssignment(assignment: Assignment) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${assignment.title}"?\n\nThis action cannot be undone.`,
    )
    if (!confirmed) return
    setDeletingAssignmentId(assignment.id)
    setError('')
    try {
      const response = await fetch(`/api/assignments/${assignment.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(await readError(response))
      setEditingAssignmentId(null)
      setSelectedAssignmentId(null)
      setRefreshKey((previous) => previous + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete assignment.')
    } finally {
      setDeletingAssignmentId(null)
    }
  }

  return (
    <section className="panel">
      <div className="compact-assignment-section-header">
        <div>
          <h2>Course Assignments</h2>
          <p>Select an assignment to view its instructions, submissions, and results.</p>
        </div>
        {canGrade && (
          <button
            type="button"
            className="btn-secondary"
            aria-expanded={showCreateForm}
            onClick={() => setShowCreateForm((value) => !value)}
          >
            {showCreateForm ? 'Close new assignment' : 'New assignment'}
          </button>
        )}
      </div>

      {canGrade && showCreateForm && (
        <div className="compact-assignment-create">
          <CreateAssignmentForm
            key={courseId}
            courseId={courseId}
            token={token}
            onCreated={() => setRefreshKey((n) => n + 1)}
          />
        </div>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {loading ? (
        <p>Loading assignments...</p>
      ) : assignments.length === 0 ? (
        !error && <p>No assignments available.</p>
      ) : (
        <div className="assignments-list compact-assignments-list">
          {assignments.map((assignment) => {
            const submission = submissions.find((item) =>
              item.assignment_id === assignment.id,
            ) ?? null
            const pastDeadline = Date.parse(assignment.due_at) <= now
            const studentStatus = getAssignmentProgress(assignment.due_at, submission, now)
            const expanded = selectedAssignmentId === assignment.id
            const detailsId = `assignment-details-${assignment.id}`

            return (
              <article
                id={`assignment-${assignment.id}`}
                key={assignment.id}
                className={`assignment-card assignment-card--compact${expanded ? ' is-expanded' : ''}`}
              >
                <div className="compact-assignment-summary">
                  <div className="compact-assignment-main">
                    <h3>
                      <button
                        type="button"
                        className="compact-assignment-title"
                        aria-expanded={expanded}
                        aria-controls={detailsId}
                        onClick={() => toggleAssignment(assignment.id)}
                      >
                        {assignment.title}
                      </button>
                    </h3>
                    <div className="compact-assignment-meta">
                      <span><strong>Due:</strong> {new Date(assignment.due_at).toLocaleString()}</span>
                      <span><strong>Max score:</strong> {assignment.max_score}</span>
                    </div>
                    <div className="compact-assignment-badges">
                      <span className={pastDeadline ? 'assignment-status overdue' : 'assignment-status open'}>
                        {pastDeadline ? 'Past deadline' : 'Upcoming'}
                      </span>
                      {isStudent && <AssignmentProgressBadge status={studentStatus} />}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary compact-assignment-toggle"
                    aria-expanded={expanded}
                    aria-controls={detailsId}
                    onClick={() => toggleAssignment(assignment.id)}
                  >
                    {expanded ? 'Hide details' : 'View details'}
                  </button>
                </div>

                {expanded && (
                  <div id={detailsId} className="compact-assignment-expanded">
                    {assignment.description && (
                      <div className="compact-assignment-description">
                        <strong>Description</strong>
                        <p>{assignment.description}</p>
                      </div>
                    )}
                    {assignment.instructions && (
                      <div className="assignment-instructions">
                        <strong>Instructions</strong>
                        <p>{assignment.instructions}</p>
                      </div>
                    )}

                    {canGrade && (
                      <div className="assignment-manage">
                        {editingAssignmentId !== assignment.id ? (
                          <div className="assignment-manage-actions">
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => setEditingAssignmentId(assignment.id)}
                            >
                              Edit Assignment
                            </button>
                            <button
                              type="button"
                              className="btn-danger"
                              disabled={deletingAssignmentId !== null}
                              onClick={() => void deleteAssignment(assignment)}
                            >
                              {deletingAssignmentId === assignment.id ? 'Deleting...' : 'Delete Assignment'}
                            </button>
                          </div>
                        ) : (
                          <EditAssignmentForm
                            assignment={assignment}
                            token={token}
                            onSaved={() => {
                              setEditingAssignmentId(null)
                              setRefreshKey((n) => n + 1)
                            }}
                            onCancel={() => setEditingAssignmentId(null)}
                          />
                        )}
                      </div>
                    )}

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
                          <p role="status">No submission was received before the deadline.</p>
                        )}
                        <AssignmentAttemptReviewPanel
                          assignmentId={assignment.id}
                          token={token}
                          mode="student"
                        />
                      </>
                    )}

                    {canGrade && (
                      <>
                        {pastDeadline ? (
                          <AssignmentGrading
                            assignmentId={assignment.id}
                            maxScore={assignment.max_score}
                            token={token}
                            focusedSubmissionId={
                              focusRequest?.assignmentId === assignment.id
                                ? focusRequest.submissionId
                                : undefined
                            }
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
                          mode={role.toLowerCase() === 'admin' ? 'admin' : 'professor'}
                        />
                      </>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
