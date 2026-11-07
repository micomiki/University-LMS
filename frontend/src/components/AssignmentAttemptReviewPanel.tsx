import { useEffect, useState, type ChangeEvent } from 'react'
import './AssignmentAttemptReviewPanel.css'

type Mode = 'student' | 'professor' | 'admin'

type Submission = {
  id: number
  assignment_id: number
  student_id: number
}

type Attempt = {
  id: number
  submission_id: number
  attempt_number: number
  text_response: string | null
  original_filename: string | null
  submitted_at: string
  feedback: string | null
  reviewed_by: number | null
  reviewed_at: string | null
}

type Props = {
  assignmentId: number
  token: string
  mode: Mode
}

async function responseOrThrow(response: Response): Promise<Response> {
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null)
    const detail =
      data && typeof data === 'object' && 'detail' in data
        ? (data as { detail: unknown }).detail
        : null
    throw new Error(
      typeof detail === 'string'
        ? detail
        : `Request failed (HTTP ${response.status}).`,
    )
  }
  return response
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export default function AssignmentAttemptReviewPanel({
  assignmentId,
  token,
  mode,
}: Props) {
  const [open, setOpen] = useState(false)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [submissionId, setSubmissionId] = useState<number | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)
  const [loadingAttempts, setLoadingAttempts] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const canReview = mode === 'professor' || mode === 'admin'

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()

    async function loadSubmissions() {
      setLoadingSubmissions(true)
      setError('')
      setNotice('')
      setSubmissions([])
      setSubmissionId(null)
      setAttempts([])
      try {
        const endpoint = canReview
          ? `/api/submissions/assignments/${assignmentId}`
          : '/api/submissions/my-submissions'
        const response = await responseOrThrow(
          await fetch(endpoint, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }),
        )
        const data = (await response.json()) as Submission[]
        const matching = canReview
          ? data
          : data.filter((item) => item.assignment_id === assignmentId)
        if (!controller.signal.aborted) {
          setSubmissions(matching)
          setSubmissionId(matching.length > 0 ? matching[0].id : null)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unable to load submissions.')
        }
      } finally {
        if (!controller.signal.aborted) setLoadingSubmissions(false)
      }
    }

    void loadSubmissions()
    return () => controller.abort()
  }, [open, assignmentId, token, canReview])

  useEffect(() => {
    if (!open || submissionId === null) return
    const controller = new AbortController()

    async function loadAttempts() {
      setLoadingAttempts(true)
      setError('')
      setNotice('')
      setAttempts([])
      try {
        const response = await responseOrThrow(
          await fetch(`/api/submission-attempts/submissions/${submissionId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }),
        )
        const data = (await response.json()) as Attempt[]
        if (!controller.signal.aborted) {
          setAttempts(data)
          setDrafts(
            Object.fromEntries(data.map((attempt) => [attempt.id, attempt.feedback ?? ''])),
          )
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unable to load attempts.')
        }
      } finally {
        if (!controller.signal.aborted) setLoadingAttempts(false)
      }
    }

    void loadAttempts()
    return () => controller.abort()
  }, [open, submissionId, token])

  async function saveFeedback(attempt: Attempt) {
    const feedback = (drafts[attempt.id] ?? '').trim()
    if (!feedback) {
      setError('Write a comment before saving.')
      return
    }
    setSavingId(attempt.id)
    setError('')
    setNotice('')
    try {
      const response = await responseOrThrow(
        await fetch(`/api/submission-attempts/${attempt.id}/feedback`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ feedback }),
        }),
      )
      const updated = (await response.json()) as Attempt
      setAttempts((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item)),
      )
      setDrafts((previous) => ({ ...previous, [attempt.id]: updated.feedback ?? '' }))
      setNotice(`Feedback saved for Attempt ${attempt.attempt_number}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save feedback.')
    } finally {
      setSavingId(null)
    }
  }

  async function downloadAttempt(attempt: Attempt) {
    if (!attempt.original_filename) return
    setDownloadingId(attempt.id)
    setError('')
    try {
      const response = await responseOrThrow(
        await fetch(`/api/submission-attempts/${attempt.id}/download`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      )
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = attempt.original_filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download the file.')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <section className="attempt-review-panel">
      <button
        type="button"
        className="attempt-review-toggle"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        {open ? 'Hide submission history' : 'View submission attempts and feedback'}
      </button>

      {open && (
        <div className="attempt-review-body">
          <h4>{canReview ? 'Student submissions and reviews' : 'My submission history'}</h4>
          {error && <p className="attempt-review-error" role="alert">{error}</p>}
          {notice && <p className="attempt-review-success" role="status">{notice}</p>}
          {loadingSubmissions ? (
            <p>Loading submissions...</p>
          ) : submissions.length === 0 ? (
            <p className="attempt-review-muted">No submissions have been recorded for this assignment.</p>
          ) : (
            <>
              {canReview && (
                <label className="attempt-review-student-selector">
                  Select student
                  <select
                    value={submissionId ?? ''}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => setSubmissionId(Number(event.target.value))}
                  >
                    {submissions.map((submission) => (
                      <option key={submission.id} value={submission.id}>
                        Student #{submission.student_id} — Submission #{submission.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {loadingAttempts ? (
                <p>Loading attempts...</p>
              ) : attempts.length === 0 ? (
                <p className="attempt-review-muted">No attempt records found for this submission.</p>
              ) : (
                <div className="attempt-review-list">
                  {attempts.map((attempt, index) => (
                    <article className="attempt-review-card" key={attempt.id}>
                      <div className="attempt-review-heading">
                        <strong>Attempt {attempt.attempt_number}</strong>
                        {index === attempts.length - 1 && (
                          <span className="attempt-review-latest">Latest</span>
                        )}
                        <span className="attempt-review-date">{formatDate(attempt.submitted_at)}</span>
                      </div>

                      {attempt.text_response && (
                        <div className="attempt-review-response">
                          <span className="attempt-review-caption">Student response</span>
                          <p>{attempt.text_response}</p>
                        </div>
                      )}

                      {attempt.original_filename && (
                        <button
                          type="button"
                          className="attempt-review-download"
                          disabled={downloadingId === attempt.id}
                          onClick={() => void downloadAttempt(attempt)}
                        >
                          {downloadingId === attempt.id
                            ? 'Downloading...'
                            : `Download: ${attempt.original_filename}`}
                        </button>
                      )}

                      {canReview ? (
                        <div className="attempt-review-feedback">
                          <label htmlFor={`attempt-feedback-${attempt.id}`}>
                            Professor feedback for Attempt {attempt.attempt_number}
                          </label>
                          <textarea
                            id={`attempt-feedback-${attempt.id}`}
                            value={drafts[attempt.id] ?? ''}
                            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                              setDrafts((previous) => ({
                                ...previous,
                                [attempt.id]: event.target.value,
                              }))
                            }
                            maxLength={5000}
                            rows={3}
                            placeholder="Write feedback for this attempt..."
                          />
                          
<button
  type="button"
  className="attempt-review-save"
  disabled={
    savingId !== null ||
    !(drafts[attempt.id] ?? '').trim() ||
    (drafts[attempt.id] ?? '').trim() ===
      (attempt.feedback ?? '').trim()
  }
  onClick={() => void saveFeedback(attempt)}
>
  {savingId === attempt.id
    ? 'Saving...'
    : 'Save Feedback'}
</button>

                          {attempt.reviewed_at && (
                            <small className="attempt-review-date">
                              Reviewed {formatDate(attempt.reviewed_at)}
                            </small>
                          )}
                        </div>
                      ) : (
                        <div className="attempt-review-feedback attempt-review-readonly">
                          <strong>Professor feedback</strong>
                          <p>{attempt.feedback || 'Not reviewed yet.'}</p>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
