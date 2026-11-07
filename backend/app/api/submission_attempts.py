from app.services.notification_events import queue_attempt_feedback_notification
from datetime import datetime, timezone
from pathlib import Path
from fastapi.responses import FileResponse
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.dependencies import get_current_user

from app.models.user import User, UserRole
from app.models.course import Course
from app.models.assignment import Assignment
from app.models.submission import Submission
from app.models.submission_attempt import SubmissionAttempt

from app.schemas.submission_attempt import (
    AttemptFeedbackUpdate,
    SubmissionAttemptRead,
)


router = APIRouter(
    prefix="/api/submission-attempts",
    tags=["Submission Attempts"],
)


def check_attempt_access(
    db: Session,
    submission: Submission,
    current_user: User,
    require_professor: bool = False,
):
    assignment = db.get(
        Assignment,
        submission.assignment_id,
    )

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found.",
        )

    if current_user.role == UserRole.ADMIN:
        return

    if current_user.role == UserRole.PROFESSOR:
        course = db.get(
            Course,
            assignment.course_id,
        )

        if course and course.professor_id == current_user.id:
            return

    if (
        not require_professor
        and current_user.role == UserRole.STUDENT
        and submission.student_id == current_user.id
    ):
        return

    raise HTTPException(
        status_code=403,
        detail="Access denied.",
    )


@router.get(
    "/submissions/{submission_id}",
    response_model=list[SubmissionAttemptRead],
)
def list_submission_attempts(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    submission = db.get(Submission, submission_id)

    if not submission:
        raise HTTPException(
            status_code=404,
            detail="Submission not found.",
        )

    check_attempt_access(
        db,
        submission,
        current_user,
    )

    return (
        db.query(SubmissionAttempt)
        .filter(
            SubmissionAttempt.submission_id == submission_id
        )
        .order_by(SubmissionAttempt.attempt_number)
        .all()
    )


@router.put(
    "/{attempt_id}/feedback",
    response_model=SubmissionAttemptRead,
)
def update_attempt_feedback(
    attempt_id: int,
    data: AttemptFeedbackUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attempt = db.get(SubmissionAttempt, attempt_id)

    if not attempt:
        raise HTTPException(
            status_code=404,
            detail="Submission attempt not found.",
        )

    submission = db.get(
        Submission,
        attempt.submission_id,
    )

    if not submission:
        raise HTTPException(
            status_code=404,
            detail="Submission not found.",
        )

    # Students cannot write professor feedback.
    check_attempt_access(
        db,
        submission,
        current_user,
        require_professor=True,
    )

    new_feedback = data.feedback.strip()
    if not new_feedback:
        raise HTTPException(
            status_code=422,
            detail="Feedback cannot be empty.",
        )
    old_feedback = (attempt.feedback or "").strip()

    attempt.feedback = new_feedback
    attempt.reviewed_by = current_user.id
    attempt.reviewed_at = datetime.now(timezone.utc)

    if new_feedback != old_feedback:
        assignment = db.get(Assignment, submission.assignment_id)
        if assignment is None:
            raise HTTPException(status_code=404, detail="Assignment not found.")
        queue_attempt_feedback_notification(
            db,
            submission=submission,
            assignment=assignment,
            attempt=attempt,
            actor_id=current_user.id,
        )

    db.commit()
    db.refresh(attempt)
    return attempt
@router.get("/{attempt_id}/download")
def download_attempt_file(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attempt = db.get(SubmissionAttempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found.")

    submission = db.get(Submission, attempt.submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found.")

    # Only the submitting student, assigned professor or admin can download.
    check_attempt_access(db, submission, current_user)

    if not attempt.stored_filename:
        raise HTTPException(status_code=404, detail="No file for this attempt.")

    stored_name = attempt.stored_filename
    if Path(stored_name).name != stored_name:
        raise HTTPException(status_code=404, detail="Invalid filename.")

    file_path = (
        Path(__file__).resolve().parents[2]
        / "uploads"
        / "assignment_submissions"
        / stored_name
    )
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")

    return FileResponse(
        path=file_path,
        filename=attempt.original_filename or "submission",
        media_type="application/octet-stream",
    )

