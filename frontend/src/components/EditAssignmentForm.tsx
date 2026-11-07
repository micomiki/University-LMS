
import { useState, type FormEvent } from 'react'

type Assignment = {
  id: number
  title: string
  description: string | null
  instructions: string | null
  due_at: string
  max_score: number | string
}

type Props = {
  assignment: Assignment
  token: string
  onSaved: () => void
  onCancel: () => void
}

function toLocalDateTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    `${date.getFullYear()}-` +
    `${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())}T` +
    `${pad(date.getHours())}:` +
    `${pad(date.getMinutes())}`
  )
}

export default function EditAssignmentForm({
  assignment,
  token,
  onSaved,
  onCancel,
}: Props) {
  const [title, setTitle] = useState(assignment.title)
  const [description, setDescription] = useState(
    assignment.description ?? ''
  )
  const [instructions, setInstructions] = useState(
    assignment.instructions ?? ''
  )
  const [dueAt, setDueAt] = useState(
    toLocalDateTime(assignment.due_at)
  )
  const [maxScore, setMaxScore] = useState(
    String(assignment.max_score)
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    setError('')

    const deadline = new Date(dueAt)
    const score = Number(maxScore)

    if (!title.trim()) {
      setError('Assignment title is required.')
      return
    }

    if (Number.isNaN(deadline.getTime())) {
      setError('Enter a valid deadline.')
      return
    }

    if (!Number.isFinite(score) || score <= 0) {
      setError('Maximum score must be greater than zero.')
      return
    }

    setSaving(true)

    try {
      const response = await fetch(
        `/api/assignments/${assignment.id}`,
        {
          method: 'PUT',
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
            : `Update failed (${response.status}).`
        )
      }

      onSaved()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update assignment.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="edit-assignment-form"
      onSubmit={handleSubmit}
    >
      <h3>Edit Assignment</h3>

      <label htmlFor={`title-${assignment.id}`}>
        Title
      </label>
      <input
        id={`title-${assignment.id}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        required
      />

      <label htmlFor={`description-${assignment.id}`}>
        Description
      </label>
      <textarea
        id={`description-${assignment.id}`}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
      />

      <label htmlFor={`instructions-${assignment.id}`}>
        Instructions
      </label>
      <textarea
        id={`instructions-${assignment.id}`}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={5}
      />

      <label htmlFor={`due-${assignment.id}`}>
        Deadline
      </label>
      <input
        id={`due-${assignment.id}`}
        type="datetime-local"
        value={dueAt}
        onChange={(e) => setDueAt(e.target.value)}
        required
      />

      <label htmlFor={`score-${assignment.id}`}>
        Maximum Score
      </label>
      <input
        id={`score-${assignment.id}`}
        type="number"
        min="0.01"
        step="0.01"
        value={maxScore}
        onChange={(e) => setMaxScore(e.target.value)}
        required
      />

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="submission-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

        <button
          type="button"
          className="btn-secondary"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
