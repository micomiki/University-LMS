import { useState, type FormEvent } from 'react'

type Props = {
  assignmentId: number
  token: string
  onSubmitted: () => void | Promise<void>
}

export default function AddNewSubmissionForm({
  assignmentId,
  token,
  onSubmitted,
}: Props) {
  const [open, setOpen] = useState(false)
  const [textResponse, setTextResponse] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!textResponse.trim() && !file) {
      setError('Enter a response or attach a file.')
      return
    }

    const form = new FormData()
    if (textResponse.trim()) form.append('text_response', textResponse.trim())
    if (file) form.append('file', file)

    setSaving(true)
    try {
      const response = await fetch(`/api/submissions/assignments/${assignmentId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          typeof body?.detail === 'string'
            ? body.detail
            : `Unable to add submission (HTTP ${response.status}).`,
        )
      }

      setTextResponse('')
      setFile(null)
      setOpen(false)
      setMessage('New attempt added successfully.')
      await onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add submission.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="new-attempt-form">
      {!open && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setOpen(true)
            setError('')
            setMessage('')
          }}
        >
          + Add New Submission
        </button>
      )}

      {message && <p className="success-message" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {open && (
        <form onSubmit={(event) => void handleSubmit(event)}>
          <h4>Add New Submission Attempt</h4>
          <p>
            This creates a separate attempt. Earlier attempts and professor feedback
            will remain in your submission history.
          </p>
          <label htmlFor={`new-attempt-text-${assignmentId}`}>
            Response (optional when a file is attached)
          </label>
          <textarea
            id={`new-attempt-text-${assignmentId}`}
            rows={5}
            value={textResponse}
            onChange={(event) => setTextResponse(event.target.value)}
          />
          <label htmlFor={`new-attempt-file-${assignmentId}`}>Attach file (optional)</label>
          <input
            id={`new-attempt-file-${assignmentId}`}
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.csv,.xls,.xlsx,.png,.jpg,.jpeg"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <div className="submission-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Submitting...' : 'Submit New Attempt'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={() => {
                setOpen(false)
                setTextResponse('')
                setFile(null)
                setError('')
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
