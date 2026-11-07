import './AssignmentProgress.css'

export type AssignmentProgressStatus =
  | 'not-submitted'
  | 'missing'
  | 'submitted'
  | 'under-review'
  | 'graded'

export type GradeSnapshot = {
  score?: number | string | null
  graded_at?: string | null
}

/**
 * Derive a student's assignment status from the deadline and CURRENT
 * submission record. The backend remains the authority for all actions.
 * "Under review" means closed to submissions and awaiting final grading;
 * it does NOT assert that a professor has started reviewing the work.
 */
export function getAssignmentProgress(
  dueAt: string,
  submission: GradeSnapshot | null | undefined,
  now = Date.now(),
): AssignmentProgressStatus {
  const deadline = Date.parse(dueAt)
  const isClosed = Number.isFinite(deadline) && now >= deadline

  if (!submission) {
    return isClosed ? 'missing' : 'not-submitted'
  }

  // A valid score of zero is still a grade.
  if (submission.score !== null && submission.score !== undefined) {
    return 'graded'
  }

  return isClosed ? 'under-review' : 'submitted'
}

const STATUS_DETAILS: Record<
  AssignmentProgressStatus,
  { label: string; explanation: string }
> = {
  'not-submitted': {
    label: 'Not submitted',
    explanation: 'No submission has been received yet.',
  },
  missing: {
    label: 'Missing',
    explanation: 'The deadline has passed and no submission was received.',
  },
  submitted: {
    label: 'Submitted',
    explanation: 'A submission has been received. The deadline is still open.',
  },
  'under-review': {
    label: 'Awaiting grading',
    explanation: 'The deadline has passed. Final grading is pending.',
  },
  graded: {
    label: 'Graded',
    explanation: 'A final score has been recorded.',
  },
}

type Props = {
  status: AssignmentProgressStatus
}

export default function AssignmentProgressBadge({ status }: Props) {
  const { label, explanation } = STATUS_DETAILS[status]
  return (
    <span
      className={`assignment-progress assignment-progress--${status}`}
      title={explanation}
      aria-label={`Assignment status: ${label}`}
    >
      {label}
    </span>
  )
}
