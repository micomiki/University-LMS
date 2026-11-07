import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AssignmentAttemptReviewPanel from '../components/AssignmentAttemptReviewPanel'
import { exampleAttempt, jsonResponse } from './helpers'

const submissions = [
  { id: 15, assignment_id: 3, student_id: 7 },
  { id: 16, assignment_id: 3, student_id: 9 },
]

function mockRoutes() {
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url)
    if (path === '/api/submissions/assignments/3') return jsonResponse(submissions)
    if (path === '/api/submissions/my-submissions') {
      return jsonResponse([submissions[0], { id: 88, assignment_id: 8, student_id: 7 }])
    }
    if (path === '/api/submission-attempts/submissions/15') return jsonResponse([exampleAttempt])
    if (path === '/api/submission-attempts/submissions/16') {
      return jsonResponse([{ ...exampleAttempt, id: 201, submission_id: 16, feedback: null, reviewed_at: null }])
    }
    if (path === '/api/submission-attempts/101/feedback' && init?.method === 'PUT') {
      return jsonResponse({
        ...exampleAttempt,
        feedback: (JSON.parse(String(init.body)) as { feedback: string }).feedback,
      })
    }
    throw new Error(`Unexpected mocked request: ${String(init?.method ?? 'GET')} ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('AssignmentAttemptReviewPanel', () => {
  it('lets a professor edit feedback and disables Save once it is unchanged', async () => {
    const fetchMock = mockRoutes()
    const user = userEvent.setup()
    render(<AssignmentAttemptReviewPanel assignmentId={3} token="test-token" mode="professor" />)
    await user.click(screen.getByRole('button', { name: /view submission attempts/i }))
    const input = await screen.findByRole('textbox', { name: /professor feedback for attempt 1/i })
    const save = screen.getByRole('button', { name: /save feedback/i })

    expect(input).toHaveValue('Please improve the architecture.')
    expect(save).toBeDisabled()
    await user.clear(input)
    await user.type(input, 'Add proper error handling.')
    expect(save).toBeEnabled()
    await user.click(save)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Feedback saved for Attempt 1.'))
    await waitFor(() => expect(save).toBeDisabled())
    const putCall = fetchMock.mock.calls.find(([url, init]) =>
      String(url) === '/api/submission-attempts/101/feedback' && init?.method === 'PUT',
    )
    expect(putCall).toBeDefined()
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({ feedback: 'Add proper error handling.' })
  })

  it('loads an attempt belonging to the selected student', async () => {
    const fetchMock = mockRoutes()
    const user = userEvent.setup()
    render(<AssignmentAttemptReviewPanel assignmentId={3} token="test-token" mode="professor" />)
    await user.click(screen.getByRole('button', { name: /view submission attempts/i }))
    const studentSelector = await screen.findByRole('combobox', { name: /select student/i })
    await screen.findByText('Project first attempt')
    await user.selectOptions(studentSelector, '16')
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/submission-attempts/submissions/16')).toBe(true),
    )
  })

  it('lets a student read their feedback without professor editing controls', async () => {
    const fetchMock = mockRoutes()
    const user = userEvent.setup()
    render(<AssignmentAttemptReviewPanel assignmentId={3} token="test-token" mode="student" />)
    await user.click(screen.getByRole('button', { name: /view submission attempts/i }))
    expect(await screen.findByText('Please improve the architecture.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save feedback/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /select student/i })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/submission-attempts/submissions/88')).toBe(false)
  })
})
