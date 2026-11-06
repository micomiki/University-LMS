
import { useState, type FormEvent } from 'react'

type Meeting = {
  id: number
  title: string
  description: string | null
  starts_at: string
  ends_at: string
}

type Props = {
  meeting: Meeting
  token: string
  onUpdated: () => void | Promise<void>
  onCancel: () => void
}

// Convert API datetime into the browser's local time.
function toLocalDateTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (number: number) =>
    String(number).padStart(2, '0')

  return (
    `${date.getFullYear()}-` +
    `${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())}T` +
    `${pad(date.getHours())}:` +
    `${pad(date.getMinutes())}`
  )
}

export default function EditMeetingForm({
  meeting,
  token,
  onUpdated,
  onCancel,
}: Props) {
  const [title, setTitle] = useState(meeting.title)

  const [description, setDescription] = useState(
    meeting.description || ''
  )

  const [startsAt, setStartsAt] = useState(
    toLocalDateTime(meeting.starts_at)
  )

  const [endsAt, setEndsAt] = useState(
    toLocalDateTime(meeting.ends_at)
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    setError('')

    const start = new Date(startsAt)
    const end = new Date(endsAt)

    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start
    ) {
      setError('End time must be later than start time.')
      return
    }

    if (!title.trim()) {
      setError('Meeting title is required.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(
        `/api/meetings/${meeting.id}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
          }),
        }
      )

      if (!response.ok) {
        const data = await response
          .json()
          .catch(() => null)

        throw new Error(
          typeof data?.detail === 'string'
            ? data.detail
            : `Failed to update meeting (${response.status}).`
        )
      }

      await onUpdated()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update meeting.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="edit-meeting-form">
      <h3>Edit Online Class</h3>

      <form onSubmit={handleSubmit}>
        <label htmlFor={`title-${meeting.id}`}>
          Meeting Title
        </label>
        <input
          id={`title-${meeting.id}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />

        <label htmlFor={`description-${meeting.id}`}>
          Description
        </label>
        <textarea
          id={`description-${meeting.id}`}
          value={description}
          onChange={(e) =>
            setDescription(e.target.value)
          }
          rows={3}
        />

        <label htmlFor={`start-${meeting.id}`}>
          Start Date and Time
        </label>
        <input
          id={`start-${meeting.id}`}
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
        />

        <label htmlFor={`end-${meeting.id}`}>
          End Date and Time
        </label>
        <input
          id={`end-${meeting.id}`}
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          required
        />

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="meeting-actions">
          <button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            Close Editor
          </button>
        </div>
      </form>
    </div>
  )
}
