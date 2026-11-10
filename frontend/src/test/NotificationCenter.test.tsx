import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NotificationCenter from '../components/NotificationCenter'

const sample = {
  id: 5,
  event_type: 'attempt_feedback',
  title: 'New feedback on your submission',
  message: 'Your professor reviewed Attempt 1.',
  course_id: 9,
  assignment_id: 20,
  attempt_id: 55,
  created_at: '2026-11-07T12:00:00Z',
  read_at: null as string | null,
}

function mockAPI(initialUnread = true) {
  let read = !initialUnread
  const calls: string[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.endsWith('/read')) {
      read = true
      return { ok: true, json: async () => ({ ...sample, read_at: sample.created_at }) }
    }
    if (url.endsWith('/read-all')) {
      read = true
      return { ok: true, json: async () => ({ unread_count: 0 }) }
    }
    if (url.includes('/unread-count')) {
      return { ok: true, json: async () => ({ unread_count: read ? 0 : 1 }) }
    }
    if (url.includes('/api/notifications/')) {
      return { ok: true, json: async () => [{ ...sample, read_at: read ? sample.created_at : null }] }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows unread count and notification details', async () => {
    mockAPI()
    render(<NotificationCenter token="test-token" onOpenAssignment={vi.fn()} />)
    await screen.findByRole('button', { name: 'Notifications (1)' })
    await userEvent.click(screen.getByRole('button', { name: 'Notifications (1)' }))
    expect(screen.getByText('New feedback on your submission')).toBeTruthy()
    expect(screen.getByText('Your professor reviewed Attempt 1.')).toBeTruthy()
  })

  it('marks an item as read and reduces the count', async () => {
    const { calls } = mockAPI()
    render(<NotificationCenter token="test-token" onOpenAssignment={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications (1)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark read' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy())
    expect(calls).toContain('PATCH /api/notifications/5/read')
  })

  it('opens the related assignment after selecting a notification', async () => {
    mockAPI()
    const onOpenAssignment = vi.fn()
    render(<NotificationCenter token="test-token" onOpenAssignment={onOpenAssignment} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications (1)' }))
    await userEvent.click(screen.getByRole('button', { name: 'View assignment' }))
    await waitFor(() => expect(onOpenAssignment).toHaveBeenCalledWith(9, 20))
  })

  it('offers mark all as read', async () => {
    const { calls } = mockAPI()
    render(<NotificationCenter token="test-token" onOpenAssignment={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications (1)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy())
    expect(calls).toContain('PATCH /api/notifications/read-all')
  })
})
