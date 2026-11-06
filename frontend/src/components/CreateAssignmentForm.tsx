
import { useState, type FormEvent } from 'react'

type Props = {
  courseId: number
  token: string
  onCreated: () => void
}

export default function CreateAssignmentForm({
  courseId,
  token,
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [maxScore, setMaxScore] = useState('100')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    setError('')
    setMessage('')

    const deadline = new Date(dueAt)
    const score = Number(maxScore)

    if (!title.trim()) {
      setError('Assignment title is required.')
      return
    }

    if (
      !Number.isFinite(deadline.getTime()) ||
      deadline <= new Date()
    ) {
      setError('Select a future deadline.')
      return
    }

    if (!Number.isFinite(score) || score <= 0) {
      setError('Maximum score must be greater than zero.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(
        `/api/assignments/courses/${courseId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            instructions: instructions.trim() || null,
            due_at: deadline.toISOString(),
            max_score: score,
          }),
        }
      )

      if (!response.ok) {
        const data = await response.json().catch(() => null)

        throw new Error(
          typeof data?.detail === 'string'
            ? data.detail
            : `Unable to create assignment (${response.status}).`
        )
      }

      setTitle('')
      setDescription('')
      setInstructions('')
      setDueAt('')
      setMaxScore('100')
      setOpen(false)
      setMessage('Assignment created successfully.')

      onCreated()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to create assignment.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="create-assignment">
      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setMessage('')
          }}
        >
          + Create Assignment
        </button>
      )}

      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {open && (
        <form onSubmit={handleSubmit}>
          <h3>Create New Assignment</h3>

          <label htmlFor="new-assignment-title">
            Title
          </label>
          <input
            id="new-assignment-title"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <label htmlFor="new-assignment-description">
            Description
          </label>
          <textarea
            id="new-assignment-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <label htmlFor="new-assignment-instructions">
            Instructions
          </label>
          <textarea
            id="new-assignment-instructions"
            rows={5}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />

          <label htmlFor="new-assignment-deadline">
            Submission Deadline
          </label>
          <input
            id="new-assignment-deadline"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            required
          />

          <label htmlFor="new-assignment-score">
            Maximum Score
          </label>
          <input
            id="new-assignment-score"
            type="number"
            min="0.01"
            step="0.01"
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            required
          />

          <div className="submission-actions">
            <button type="submit" disabled={loading}>
              {loading
                ? 'Creating...'
                : 'Create Assignment'}
            </button>

            <button
              type="button"
              className="btn-secondary"
              disabled={loading}
              onClick={() => {
                setOpen(false)
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
