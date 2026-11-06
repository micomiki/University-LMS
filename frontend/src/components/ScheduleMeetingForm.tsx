
import { useState, type FormEvent } from 'react'

type Props = {
  courseId: number
  token: string
  onCreated: () => void | Promise<void>
}

export default function ScheduleMeetingForm({
  courseId,
  token,
  onCreated,
}: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')

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

    setLoading(true)

    try {
      const response = await fetch(
        `/api/meetings/courses/${courseId}`,
        {
          method: 'POST',
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
        const data = await response.json().catch(() => null)

        throw new Error(
          typeof data?.detail === 'string'
            ? data.detail
            : `Failed to schedule meeting (${response.status}).`
        )
      }

      setTitle('')
      setDescription('')
      setStartsAt('')
      setEndsAt('')
      setMessage('Meeting scheduled successfully.')

      await onCreated()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to schedule meeting.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel">
      <h2>Schedule Online Class</h2>

      <form onSubmit={handleSubmit}>
        <label htmlFor="meeting-title">Meeting Title</label>
        <input
          id="meeting-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Software Engineering Lecture"
          maxLength={200}
          required
        />

        <label htmlFor="meeting-description">
          Description
        </label>
        <textarea
          id="meeting-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Lecture topics and instructions"
          rows={4}
        />

        <label htmlFor="meeting-start">Start Date and Time</label>
        <input
          id="meeting-start"
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
        />

        <label htmlFor="meeting-end">End Date and Time</label>
        <input
          id="meeting-end"
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          required
        />

        {error && <p className="error" role="alert">{error}</p>}

        {message && (
          <p className="success-message" role="status">
            {message}
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? 'Scheduling...' : 'Schedule Class'}
        </button>
      </form>
    </section>
  )
}
