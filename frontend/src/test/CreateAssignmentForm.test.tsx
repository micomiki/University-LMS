import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateAssignmentForm from '../components/CreateAssignmentForm'
import { jsonResponse, localDateTimeHoursFromNow } from './helpers'

async function completeForm() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /create assignment/i }))
  await user.type(screen.getByRole('textbox', { name: /^title$/i }), 'Project assignment')
  fireEvent.change(screen.getByLabelText(/submission deadline/i), {
    target: { value: localDateTimeHoursFromNow(48) },
  })
  return user
}

describe('CreateAssignmentForm', () => {
  it('defaults to Single Submission and sends false', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ id: 3 }, 201),
    )
    const onCreated = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<CreateAssignmentForm courseId={1} token="student-test-token" onCreated={onCreated} />)

    const user = await completeForm()
    expect(screen.getByRole('radio', { name: /single submission/i })).toBeChecked()
    await user.click(screen.getByRole('button', { name: /^create assignment$/i }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/assignments/courses/1')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body)).allow_multiple_submissions).toBe(false)
  })

  it('sends true when Multiple Submissions is selected', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ id: 4 }, 201),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<CreateAssignmentForm courseId={1} token="test-token" onCreated={vi.fn()} />)

    const user = await completeForm()
    await user.click(screen.getByRole('radio', { name: /multiple submissions/i }))
    expect(screen.getByRole('radio', { name: /multiple submissions/i })).toBeChecked()
    await user.click(screen.getByRole('button', { name: /^create assignment$/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).allow_multiple_submissions).toBe(true)
  })

  it('rejects a past deadline without calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<CreateAssignmentForm courseId={1} token="test-token" onCreated={vi.fn()} />)

    const user = await completeForm()
    fireEvent.change(screen.getByLabelText(/submission deadline/i), {
      target: { value: localDateTimeHoursFromNow(-24) },
    })
    await user.click(screen.getByRole('button', { name: /^create assignment$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Select a future deadline')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows an API validation message instead of closing the form', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ detail: 'Assignment creation not permitted.' }, 403),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<CreateAssignmentForm courseId={1} token="test-token" onCreated={vi.fn()} />)

    const user = await completeForm()
    await user.click(screen.getByRole('button', { name: /^create assignment$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Assignment creation not permitted.')
    expect(screen.getByRole('textbox', { name: /^title$/i })).toBeInTheDocument()
  })
})
