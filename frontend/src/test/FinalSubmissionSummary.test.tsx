import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FinalSubmissionSummary from '../components/FinalSubmissionSummary'
import { jsonResponse } from './helpers'

describe('FinalSubmissionSummary', () => {
  it('displays submitted work but no grade before professor review', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ id: 15, text_response: 'Final project work', score: null, feedback: null }),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<FinalSubmissionSummary submissionId={15} token="test-token" maxScore={100} />)

    expect(await screen.findByText('Final project work')).toBeInTheDocument()
    expect(screen.getByText(/final grade: awaiting professor grading/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit submission/i })).not.toBeInTheDocument()
  })

  it('refreshes and displays a newly published grade', async () => {
    let calls = 0
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      calls += 1
      return jsonResponse({
        id: 15,
        text_response: 'Final project work',
        score: calls === 1 ? null : 90,
        feedback: calls === 1 ? null : 'Well done.',
        graded_at: calls === 1 ? null : '2026-11-22T12:00:00Z',
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<FinalSubmissionSummary submissionId={15} token="test-token" maxScore={100} />)

    expect(await screen.findByText(/final grade: awaiting professor grading/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /refresh final grade/i }))
    await waitFor(() => expect(screen.getByText(/final grade: 90 \/ 100/i)).toBeInTheDocument())
    expect(screen.getByText(/well done/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
