import { useCallback, useEffect, useState } from 'react'
import './NotificationCenter.css'

type LMSNotification = {
  id: number
  event_type: string
  title: string
  message: string
  course_id: number | null
  assignment_id: number | null
  attempt_id: number | null
  created_at: string
  read_at: string | null
}

type Props = {
  token: string
  // Navigate to the specific assignment (not just the course).
  // A notification without assignment_id opens the course overview.
  onOpenAssignment: (courseId: number, assignmentId: number | null) => void
}

async function requestJSON<T>(path: string, token: string, method = 'GET'): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error(`Notifications request failed (${response.status}).`)
  }
  return response.json() as Promise<T>
}

export default function NotificationCenter({ token, onOpenAssignment }: Props) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<LMSNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const [items, count] = await Promise.all([
      requestJSON<LMSNotification[]>('/api/notifications/?limit=20', token),
      requestJSON<{ unread_count: number }>('/api/notifications/unread-count', token),
    ])
    setNotifications(items)
    setUnread(count.unread_count)
  }, [token])

  useEffect(() => {
    let active = true
    const sync = async () => {
      try {
        const [items, count] = await Promise.all([
          requestJSON<LMSNotification[]>('/api/notifications/?limit=20', token),
          requestJSON<{ unread_count: number }>('/api/notifications/unread-count', token),
        ])
        if (active) {
          setNotifications(items)
          setUnread(count.unread_count)
          setError('')
        }
      } catch {
        if (active) setError('Could not load notifications.')
      }
    }
    void sync()
    const timer = window.setInterval(() => void sync(), 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [token])

  async function markRead(id: number) {
    setBusy(true)
    setError('')
    try {
      await requestJSON<LMSNotification>(`/api/notifications/${id}/read`, token, 'PATCH')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark notification as read.')
    } finally {
      setBusy(false)
    }
  }

  async function markAllRead() {
    setBusy(true)
    setError('')
    try {
      await requestJSON<{ unread_count: number }>('/api/notifications/read-all', token, 'PATCH')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark all as read.')
    } finally {
      setBusy(false)
    }
  }

  async function openAssignment(item: LMSNotification) {
    if (item.course_id === null) return
    setLoading(true)
    try {
      if (item.read_at === null) await markRead(item.id)
      setOpen(false)
      onOpenAssignment(item.course_id, item.assignment_id)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="lms-notification-center">
      <button
        className="lms-notification-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="lms-notification-panel"
        onClick={() => setOpen((value) => !value)}
      >
        Notifications{unread > 0 ? ` (${unread})` : ''}
      </button>
      {open && (
        <section id="lms-notification-panel" className="lms-notification-panel" aria-label="Notifications">
          <div className="lms-notification-heading">
            <h3>Notifications</h3>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void markAllRead()}
              disabled={busy || unread === 0}
            >
              Mark all as read
            </button>
          </div>
          {error && <p role="alert" className="error">{error}</p>}
          {notifications.length === 0 ? (
            <p className="lms-notification-empty">No notifications yet.</p>
          ) : (
            <ul className="lms-notification-list">
              {notifications.map((item) => (
                <li key={item.id} className={`lms-notification-item ${item.read_at === null ? 'unread' : ''}`}>
                  <div className="lms-notification-item-title">
                    <strong>{item.title}</strong>
                    {item.read_at === null && <span className="lms-notification-dot" aria-label="Unread" />}
                  </div>
                  <p>{item.message}</p>
                  <small>{new Date(item.created_at).toLocaleString()}</small>
                  <div className="lms-notification-actions">
                    {item.course_id !== null && (
                      <button
                        type="button"
                        disabled={loading || busy}
                        onClick={() => void openAssignment(item)}
                      >
                        {item.assignment_id === null ? 'Open course' : 'View assignment'}
                      </button>
                    )}
                    {item.read_at === null && (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => void markRead(item.id)}
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
