
import { useEffect, useState } from 'react'
import AssignmentProgressBadge from './AssignmentProgress'
type Submission = {
  id: number
  assignment_id: number
  student_id: number
  text_response: string | null
  original_filename: string | null
  submitted_at: string
  score: number | string | null
  feedback: string | null
  graded_at: string | null
}

type Draft = {
  score: string
  feedback: string
}

type Props = {
  assignmentId: number
  maxScore: number | string
  token: string
  focusedSubmissionId?: number
}

async function getError(response: Response): Promise<string> {
  const data = await response.json().catch(() => null)

  return typeof data?.detail === 'string'
    ? data.detail
    : `Request failed (${response.status}).`
}

export default function AssignmentGrading({
  assignmentId,
  maxScore,
  token,
  focusedSubmissionId,
}: Props) {
  const [submissions, setSubmissions] =
    useState<Submission[]>([])

  const [drafts, setDrafts] =
    useState<Record<number, Draft>>({})

  const [editingId, setEditingId] =
    useState<number | null>(null)
  const [selectedSubmissionId, setSelectedSubmissionId] =
    useState<number | null>(null)

  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] =
    useState<number | null>(null)

  const [reloadKey, setReloadKey] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadSubmissions() {
      setLoading(true)
      setError('')
      setEditingId(null)

      try {
        const response = await fetch(
          `/api/submissions/assignments/${assignmentId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          throw new Error(await getError(response))
        }

        const data: Submission[] = await response.json()

        if (controller.signal.aborted) return

        setSubmissions(data)
        setSelectedSubmissionId((current) => {
          if (focusedSubmissionId !== undefined &&
              data.some((item) => item.id === focusedSubmissionId)) {
            return focusedSubmissionId
          }
          return current !== null && data.some((item) => item.id === current)
            ? current
            : null
        })

        const initialDrafts: Record<number, Draft> = {}

        for (const submission of data) {
          initialDrafts[submission.id] = {
            score:
              submission.score === null
                ? ''
                : String(submission.score),
            feedback: submission.feedback ?? '',
          }
        }

        setDrafts(initialDrafts)
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load submissions.'
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadSubmissions()

    return () => controller.abort()
  }, [assignmentId, token, reloadKey, focusedSubmissionId])

  useEffect(() => {
    if (focusedSubmissionId === undefined || loading ||
        selectedSubmissionId !== focusedSubmissionId) return
    document.getElementById(`submission-${focusedSubmissionId}`)
      ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }, [focusedSubmissionId, selectedSubmissionId, loading])

  function updateDraft(
    id: number,
    field: keyof Draft,
    value: string
  ) {
    setDrafts((previous) => ({
      ...previous,
      [id]: {
        ...(previous[id] ?? {
          score: '',
          feedback: '',
        }),
        [field]: value,
      },
    }))
  }

  function toggleEditor(submission: Submission) {
    if (editingId === submission.id) {
      cancelEditing(submission)
      return
    }

    setError('')
    setMessage('')

    setDrafts((previous) => ({
      ...previous,
      [submission.id]: {
        score:
          submission.score === null
            ? ''
            : String(submission.score),
        feedback: submission.feedback ?? '',
      },
    }))

    setEditingId(submission.id)
  }

  function cancelEditing(submission: Submission) {
    setEditingId(null)
    setError('')

    setDrafts((previous) => ({
      ...previous,
      [submission.id]: {
        score:
          submission.score === null
            ? ''
            : String(submission.score),
        feedback: submission.feedback ?? '',
      },
    }))
  }

  async function saveGrade(submission: Submission) {
    const draft = drafts[submission.id]

    const scoreText = draft?.score?.trim() ?? ''
    const score = Number(scoreText)
    const maximum = Number(maxScore)

    if (
      !scoreText ||
      !Number.isFinite(score) ||
      !Number.isFinite(maximum) ||
      score < 0 ||
      score > maximum
    ) {
      setError(
        `Enter a score between 0 and ${maxScore}.`
      )
      return
    }

    setSavingId(submission.id)
    setError('')
    setMessage('')

    try {
      const response = await fetch(
        `/api/submissions/${submission.id}/grade`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            score,
            feedback: draft.feedback.trim() || null,
          }),
        }
      )

      if (!response.ok) {
        throw new Error(await getError(response))
      }

      const updated: Submission = await response.json()

      setSubmissions((previous) =>
        previous.map((item) =>
          item.id === updated.id ? updated : item
        )
      )

      setEditingId(null)

      setMessage(
        `Grade saved for student #${submission.student_id}.`
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save grade.'
      )
    } finally {
      setSavingId(null)
    }
  }

  async function downloadFile(submission: Submission) {
    setError('')

    try {
      const response = await fetch(
        `/api/submissions/${submission.id}/download`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error(await getError(response))
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download =
        submission.original_filename || 'submission'

      document.body.appendChild(link)
      link.click()
      link.remove()

      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to download file.'
      )
    }
  }

  function toggleSubmission(submissionId: number) {
    setSelectedSubmissionId((current) => current === submissionId ? null : submissionId)
    setEditingId(null)
    setError('')
    setMessage('')
  }

  return (
    <section className="grading-section">
      <div className="grading-header">
        <h4>Student Submissions ({submissions.length})</h4>
        <button
          type="button"
          className="btn-secondary"
          disabled={loading}
          onClick={() => setReloadKey((n) => n + 1)}
        >
          Refresh
        </button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success-message" role="status">{message}</p>}

      {loading ? (
        <p>Loading submissions...</p>
      ) : submissions.length === 0 ? (
        !error && <p>No students have submitted yet.</p>
      ) : (
        submissions.map((submission) => {
          const expanded = selectedSubmissionId === submission.id
          const detailsId = `grading-details-${submission.id}`
          return (
            <article
              key={submission.id}
              id={`submission-${submission.id}`}
              className="grading-card grading-card--compact"
            >
              <div className="grading-header">
                <div>
                  <h4>Student #{submission.student_id}</h4>
                  <p>Submitted: {new Date(submission.submitted_at).toLocaleString()}</p>
                </div>
                <AssignmentProgressBadge
                  status={submission.score !== null ? 'graded' : 'under-review'}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  aria-expanded={expanded}
                  aria-controls={detailsId}
                  onClick={() => toggleSubmission(submission.id)}
                >
                  {expanded ? 'Hide submission' : 'View submission'}
                </button>
              </div>

              {expanded && (
                <div id={detailsId} className="grading-card__details">
                  <div className="grading-response">
                    <strong>Written Response</strong>
                    <p>{submission.text_response || 'No written response.'}</p>
                  </div>

                  {submission.original_filename && (
                    <div>
                      <p><strong>Attached File:</strong> {submission.original_filename}</p>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void downloadFile(submission)}
                      >
                        Download Submission
                      </button>
                    </div>
                  )}

                  {submission.score !== null && (
                    <div className="submission-summary">
                      <p><strong>Current Grade:</strong> {submission.score} / {maxScore}</p>
                      {submission.feedback && (
                        <div className="assignment-feedback">
                          <strong>Professor Feedback</strong>
                          <p>{submission.feedback}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={savingId !== null}
                    onClick={() => toggleEditor(submission)}
                  >
                    {submission.score !== null ? 'Update Grade' : 'Grade Submission'}
                  </button>

                  {editingId === submission.id && (
                    <div className="grading-form">
                      <label htmlFor={`score-${submission.id}`}>
                        Score (maximum {maxScore})
                      </label>
                      <input
                        id={`score-${submission.id}`}
                        type="number"
                        min="0"
                        max={Number(maxScore)}
                        step="0.01"
                        value={drafts[submission.id]?.score ?? ''}
                        onChange={(event) =>
                          updateDraft(submission.id, 'score', event.target.value)
                        }
                      />
                      <label htmlFor={`feedback-${submission.id}`}>
                        Professor Feedback
                      </label>
                      <textarea
                        id={`feedback-${submission.id}`}
                        rows={4}
                        value={drafts[submission.id]?.feedback ?? ''}
                        onChange={(event) =>
                          updateDraft(submission.id, 'feedback', event.target.value)
                        }
                        placeholder="Write feedback..."
                      />
                      <div className="grading-actions">
                        <button
                          type="button"
                          disabled={savingId !== null}
                          onClick={() => void saveGrade(submission)}
                        >
                          {savingId === submission.id ? 'Saving...' : 'Save Grade'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={savingId !== null}
                          onClick={() => cancelEditing(submission)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          )
        })
      )}
    </section>
  )
}
