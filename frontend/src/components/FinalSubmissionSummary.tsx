import { useEffect, useState } from 'react'
import './FinalSubmissionSummary.css'

type SubmissionDetail = {
  id: number
  text_response?: string | null
  original_filename?: string | null
  score?: number | string | null
  feedback?: string | null
  graded_at?: string | null
}

type Props = {
  submissionId: number
  token: string
  maxScore: number | string
}

async function requireOk(response: Response): Promise<Response> {
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(
      typeof body?.detail === 'string'
        ? body.detail
        : `Request failed (HTTP ${response.status}).`,
    )
  }
  return response
}

export default function FinalSubmissionSummary({
  submissionId,
  token,
  maxScore,
}: Props) {
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadSubmission() {
      setLoading(true)
      setError('')
      try {
        const response = await requireOk(
          await fetch(`/api/submissions/${submissionId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }),
        )
        const result = (await response.json()) as SubmissionDetail
        if (!controller.signal.aborted) setSubmission(result)
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unable to load submission.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadSubmission()
    return () => controller.abort()
  }, [submissionId, token, refreshKey])

  async function downloadFile() {
    if (!submission?.original_filename) return
    setDownloading(true)
    setError('')
    try {
      const response = await requireOk(
        await fetch(`/api/submissions/${submissionId}/download`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      )
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = submission.original_filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download file.')
    } finally {
      setDownloading(false)
    }
  }

  const hasFinalGrade = submission?.score !== null && submission?.score !== undefined

  return (
    <section className="final-submission-summary" aria-label="Final submission">
      <div className="final-submission-summary-heading">
        <h4>Final Submitted Work</h4>
        <span className="final-submission-locked">Submission closed</span>
      </div>

      {loading && <p>Loading your final submission...</p>}
      {error && <p role="alert" className="error">{error}</p>}

      {!loading && submission && (
        <>
          {submission.text_response && (
            <div className="final-submission-response">
              <strong>Response</strong>
              <p>{submission.text_response}</p>
            </div>
          )}

          {submission.original_filename && (
            <button
              type="button"
              className="btn-secondary"
              disabled={downloading}
              onClick={() => void downloadFile()}
            >
              {downloading
                ? 'Downloading...'
                : `Download submitted file: ${submission.original_filename}`}
            </button>
          )}

          <div className="final-submission-grade">
            {hasFinalGrade ? (
              <>
                <strong>Final grade: {submission.score} / {maxScore}</strong>
                {submission.feedback && (
                  <p><strong>Final grading feedback:</strong> {submission.feedback}</p>
                )}
                {submission.graded_at && (
                  <small>Graded: {new Date(submission.graded_at).toLocaleString()}</small>
                )}
              </>
            ) : (
              <p>Final grade: Awaiting professor grading.</p>
            )}
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setRefreshKey((previous) => previous + 1)}
            disabled={loading}
          >
            Refresh final grade
          </button>
        </>
      )}
    </section>
  )
}
