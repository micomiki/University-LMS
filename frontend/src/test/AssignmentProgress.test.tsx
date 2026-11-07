import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import AssignmentProgressBadge, {
  getAssignmentProgress,
} from '../components/AssignmentProgress'

const NOW = Date.parse('2026-11-07T12:00:00Z')
const FUTURE = '2026-11-10T18:00:00Z'
const PAST = '2026-11-06T18:00:00Z'

describe('getAssignmentProgress', () => {
  it('marks an open assignment without work as not submitted', () => {
    expect(getAssignmentProgress(FUTURE, null, NOW)).toBe('not-submitted')
  })

  it('marks an expired assignment without work as missing', () => {
    expect(getAssignmentProgress(PAST, null, NOW)).toBe('missing')
  })

  it('marks work received before the deadline as submitted', () => {
    expect(getAssignmentProgress(FUTURE, { score: null }, NOW)).toBe('submitted')
  })

  it('marks ungraded work after the deadline as awaiting grading', () => {
    expect(getAssignmentProgress(PAST, { score: null }, NOW)).toBe('under-review')
  })

  it('recognizes a grade of zero as graded', () => {
    expect(getAssignmentProgress(PAST, { score: 0 }, NOW)).toBe('graded')
  })

  it('recognizes a score returned as a string as graded', () => {
    expect(getAssignmentProgress(PAST, { score: '90.00' }, NOW)).toBe('graded')
  })

  it('treats the exact deadline as closed', () => {
    expect(getAssignmentProgress(PAST, null, Date.parse(PAST))).toBe('missing')
  })
})

describe('AssignmentProgressBadge', () => {
  it('renders an accessible status label', () => {
    render(<AssignmentProgressBadge status="under-review" />)
    expect(screen.getByLabelText('Assignment status: Awaiting grading')).toBeInTheDocument()
  })
})
