import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddNewSubmissionForm from '../components/AddNewSubmissionForm'
import { jsonResponse } from './helpers'

describe('AddNewSubmissionForm', () => {
  it('prevents empty attempts without sending a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<AddNewSubmissionForm assignmentId={3} token="test-token" onSubmitted={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /add new submission/i }))
    await user.click(screen.getByRole('button', { name: /submit new attempt/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a response or attach a file.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs a new attempt with its text and calls onSubmitted', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ id: 15 }, 201),
    )
    const onSubmitted = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<AddNewSubmissionForm assignmentId={3} token="test-token" onSubmitted={onSubmitted} />)

    await user.click(screen.getByRole('button', { name: /add new submission/i }))
    await user.type(screen.getByRole('textbox', { name: /response/i }), 'Updated project')
    await user.click(screen.getByRole('button', { name: /submit new attempt/i }))

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce())
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/submissions/assignments/3')
    expect(options?.method).toBe('POST')
    expect(options?.body).toBeInstanceOf(FormData)
    expect((options?.body as FormData).get('text_response')).toBe('Updated project')
    expect(screen.getByRole('status')).toHaveTextContent('New attempt added successfully.')
  })

  it('shows the error when the server rejects a new attempt', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ detail: 'Assignment deadline has passed.' }, 409),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<AddNewSubmissionForm assignmentId={3} token="test-token" onSubmitted={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /add new submission/i }))
    await user.type(screen.getByRole('textbox', { name: /response/i }), 'Late response')
    await user.click(screen.getByRole('button', { name: /submit new attempt/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Assignment deadline has passed.')
  })
})
