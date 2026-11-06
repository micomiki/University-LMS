
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'

export type StudentSubmission = {
  id: number
  assignment_id: number
  student_id: number
  text_response: string | null
  original_filename: string | null
  submitted_at: string
  updated_at: string | null
  score: number | string | null
  feedback: string | null
  graded_at: string | null
}

type Props = {
  assignmentId: number
  token: string
  existing: StudentSubmission | null
  onSubmitted: () => Promise<void>
}

const MAX_FILE_SIZE = 20 * 1024 * 1024

export default function AssignmentSubmissionForm({
  assignmentId,
  token,
  existing,
  onSubmitted,
}: Props) {
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setText(existing?.text_response ?? '')
    setFile(null)
  }, [assignmentId, existing?.text_response])

  function cancelEditing() {
    setIsEditing(false)
    setText(existing?.text_response ?? '')
    setFile(null)
    setError('')

    if (fileInput.current) {
      fileInput.current.value = ''
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    setError('')
    setMessage('')

    if (
      !text.trim() &&
      !file &&
      !existing?.original_filename
    ) {
      setError('Please enter a response or choose a file.')
      return
    }

    if (file && file.size > MAX_FILE_SIZE) {
      setError('Maximum file size is 20 MB.')
      return
    }

    setLoading(true)

    try {
      const formData = new FormData()

      formData.append('text_response', text.trim())

      if (file) {
        formData.append('file', file)
      }

      const url = existing
        ? `/api/submissions/${existing.id}`
        : `/api/submissions/assignments/${assignmentId}`

      const response = await fetch(url, {
        method: existing ? 'PUT' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)

        throw new Error(
          typeof data?.detail === 'string'
            ? data.detail
            : `Submission failed (${response.status}).`
        )
      }

      await onSubmitted()

      setFile(null)
      setIsEditing(false)

      if (fileInput.current) {
        fileInput.current.value = ''
      }

      setMessage(
        existing
          ? 'Submission updated successfully.'
          : 'Assignment submitted successfully.'
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to submit assignment.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="submission-form">
      <h4>Your Assignment Submission</h4>

      {/* Submission summary */}
      {existing && (
        <div className="submission-summary">
          <p>
            <strong>Status:</strong>{' '}
            {existing.score !== null
              ? 'Graded'
              : 'Submitted'}
          </p>

          <p>
            <strong>Submitted:</strong>{' '}
            {new Date(
              existing.submitted_at
            ).toLocaleString()}
          </p>

          {existing.text_response && (
            <div>
              <strong>Written Response:</strong>
              <p style={{ whiteSpace: 'pre-wrap' }}>
                {existing.text_response}
              </p>
            </div>
          )}

          {existing.original_filename && (
            <p>
              <strong>Uploaded File:</strong>{' '}
              {existing.original_filename}
            </p>
          )}

          {existing.score !== null && (
            <p>
              <strong>Score:</strong> {existing.score}
            </p>
          )}

          {existing.feedback && (
            <div className="assignment-feedback">
              <strong>Professor Feedback</strong>
              <p>{existing.feedback}</p>
            </div>
          )}
        </div>
      )}

      {/* Button visible when the form is closed */}
      {!isEditing && (
        <button
          type="button"
          onClick={() => {
            setMessage('')
            setIsEditing(true)
          }}
        >
          {existing
            ? 'Edit Submission'
            : 'Submit Assignment'}
        </button>
      )}

      {/* Editing form */}
      {isEditing && (
        <form onSubmit={handleSubmit}>
          <label htmlFor={`response-${assignmentId}`}>
            Written Response
          </label>

          <textarea
            id={`response-${assignmentId}`}
            rows={5}
            value={text}
            onChange={(event) =>
              setText(event.target.value)
            }
            placeholder="Write your assignment response..."
          />

          <label htmlFor={`file-${assignmentId}`}>
            {existing
              ? 'Replace / Upload File'
              : 'Upload File'}
          </label>

          <input
            ref={fileInput}
            id={`file-${assignmentId}`}
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.csv,.xls,.xlsx,.png,.jpg,.jpeg"
            onChange={(event) =>
              setFile(event.target.files?.[0] ?? null)
            }
          />

          <p className="submission-note">
            Maximum file size: 20 MB.
          </p>

          <div className="submission-actions">
            <button
              type="submit"
              disabled={loading}
            >
              {loading
                ? 'Saving...'
                : existing
                  ? 'Save Changes'
                  : 'Submit Assignment'}
            </button>

            <button
              type="button"
              className="btn-secondary"
              disabled={loading}
              onClick={cancelEditing}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
