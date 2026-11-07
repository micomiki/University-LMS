"""Queue notifications in the same transaction as feedback/grade changes.

Do not call commit here. The calling endpoint owns the transaction.
"""

from sqlalchemy.orm import Session
from app.models.assignment import Assignment
from app.models.notification import Notification
from app.models.submission import Submission
from app.models.submission_attempt import SubmissionAttempt


def queue_attempt_feedback_notification(
    db: Session,
    *,
    submission: Submission,
    assignment: Assignment,
    attempt: SubmissionAttempt,
    actor_id: int,
) -> None:
    db.add(Notification(
        recipient_id=submission.student_id,
        actor_id=actor_id,
        course_id=assignment.course_id,
        assignment_id=assignment.id,
        attempt_id=attempt.id,
        event_type="attempt_feedback",
        title="New feedback on your submission",
        message=f'Your professor reviewed Attempt {attempt.attempt_number} of "{assignment.title}".',
    ))


def queue_final_grade_notification(
    db: Session,
    *,
    submission: Submission,
    assignment: Assignment,
    actor_id: int,
) -> None:
    db.add(Notification(
        recipient_id=submission.student_id,
        actor_id=actor_id,
        course_id=assignment.course_id,
        assignment_id=assignment.id,
        attempt_id=None,
        event_type="final_grade",
        title="Your final grade is available",
        message=f'A final grade has been published for "{assignment.title}".',
    ))
