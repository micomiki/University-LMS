"""Phase 11.8C: distinct Edit Current (PUT) and Add New (POST) behavior.

Prerequisites: Assignment.allow_multiple_submissions, SubmissionAttempt and
its table, and existing grading schema already in place.

- POST creates Attempt 1 (either policy), or a NEW attempt (multiple only).
- PUT edits the CURRENT attempt in place (both policies).
- Attempt IDs and previous-attempt files/feedback are preserved on PUT.
- Student submission/edit is blocked at the deadline; grading opens after it.

Withdrawal is no longer part of the proposed UI. A pre-existing withdrawn
submission can be reactivated by POST before the deadline if the earlier
withdrawal migration was already installed.
"""

import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.submission import Submission
from app.models.submission_attempt import SubmissionAttempt
from app.models.user import User, UserRole
from app.schemas.grading import GradeSubmission
from app.schemas.submission import SubmissionRead

router = APIRouter(prefix="/api/submissions", tags=["Submissions"])

# An absolute path matches the existing download endpoint even when the
# application is started from a different working directory.
UPLOAD_DIR = (
    Path(__file__).resolve().parents[2]
    / "uploads"
    / "assignment_submissions"
)
MAX_FILE_SIZE = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".ppt", ".pptx",
    ".txt", ".csv", ".xls", ".xlsx",
    ".png", ".jpg", ".jpeg",
}


def get_assignment_or_404(assignment_id: int, db: Session) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


def check_student_enrollment(
    assignment: Assignment,
    student: User,
    db: Session,
) -> None:
    enrollment = db.query(Enrollment).filter(
        Enrollment.course_id == assignment.course_id,
        Enrollment.student_id == student.id,
    ).first()
    if not enrollment:
        raise HTTPException(
            status_code=403,
            detail="You are not enrolled in this course",
        )


def check_professor_access(
    assignment: Assignment,
    professor: User,
    db: Session,
) -> None:
    course = db.get(Course, assignment.course_id)
    if not course or course.professor_id != professor.id:
        raise HTTPException(status_code=403, detail="Access denied")


def deadline_as_utc(assignment: Assignment) -> datetime:
    """Treat legacy naive due_at values as UTC (frontend sends UTC ISO dates)."""
    deadline = assignment.due_at
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    return deadline.astimezone(timezone.utc)


def require_open_deadline(assignment: Assignment) -> None:
    if datetime.now(timezone.utc) >= deadline_as_utc(assignment):
        raise HTTPException(
            status_code=409,
            detail="The assignment deadline has passed. Changes are no longer allowed.",
        )


def require_closed_deadline(assignment: Assignment) -> None:
    if datetime.now(timezone.utc) < deadline_as_utc(assignment):
        raise HTTPException(
            status_code=409,
            detail="Final grades can be assigned only after the deadline.",
        )


def validate_file(file: UploadFile) -> None:
    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="File type is not allowed")


async def save_uploaded_file(
    file: UploadFile,
) -> tuple[str, str, Path]:
    """Save a file; remove partial uploads if validation or writing fails."""
    validate_file(file)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    extension = Path(file.filename or "").suffix.lower()
    stored_filename = f"{uuid.uuid4().hex}{extension}"
    original_filename = Path(
        (file.filename or "submission").replace("\\", "/")
    ).name[:255]
    saved_path = UPLOAD_DIR / stored_filename

    total = 0
    try:
        with saved_path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="File exceeds the 20 MB limit",
                    )
                output.write(chunk)
    except Exception:
        saved_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    return original_filename, stored_filename, saved_path


def latest_attempt(db: Session, submission_id: int) -> SubmissionAttempt | None:
    return (
        db.query(SubmissionAttempt)
        .filter(SubmissionAttempt.submission_id == submission_id)
        .order_by(SubmissionAttempt.attempt_number.desc())
        .first()
    )


def ensure_initial_attempt(db: Session, submission: Submission) -> SubmissionAttempt:
    """Support old submissions that predate the submission_attempts table."""
    attempt = latest_attempt(db, submission.id)
    if attempt is not None:
        return attempt

    attempt = SubmissionAttempt(
        submission_id=submission.id,
        attempt_number=1,
        text_response=submission.text_response,
        original_filename=submission.original_filename,
        stored_filename=submission.stored_filename,
        submitted_at=submission.submitted_at,
    )
    db.add(attempt)
    db.flush()
    return attempt


def clear_previous_grade(submission: Submission) -> None:
    # A final grade is valid only for the version reviewed after the deadline.
    submission.score = None
    submission.feedback = None
    submission.graded_by = None
    submission.graded_at = None


def make_new_attempt(
    db: Session,
    submission: Submission,
    attempt_number: int,
) -> None:
    db.add(
        SubmissionAttempt(
            submission_id=submission.id,
            attempt_number=attempt_number,
            text_response=submission.text_response,
            original_filename=submission.original_filename,
            stored_filename=submission.stored_filename,
            submitted_at=datetime.now(timezone.utc),
        )
    )


@router.post(
    "/assignments/{assignment_id}",
    response_model=SubmissionRead,
    status_code=status.HTTP_201_CREATED,
)
async def submit_assignment(
    assignment_id: int,
    text_response: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.STUDENT)),
):
    assignment = get_assignment_or_404(assignment_id, db)
    check_student_enrollment(assignment, current_user, db)
    require_open_deadline(assignment)

    if not (text_response and text_response.strip()) and file is None:
        raise HTTPException(
            status_code=400,
            detail="Provide a text response or upload a file",
        )

    # Row lock serializes concurrent attempts for an existing submission.
    existing = (
        db.query(Submission)
        .filter(
            Submission.assignment_id == assignment_id,
            Submission.student_id == current_user.id,
        )
        .with_for_update()
        .first()
    )
    # Handle legacy withdrawn records only if the optional field already exists.
    # Current UI does not expose withdrawal.
    was_withdrawn = bool(getattr(existing, "is_withdrawn", False)) if existing is not None else False
    if existing is not None and not assignment.allow_multiple_submissions and not was_withdrawn:
        raise HTTPException(
            status_code=409,
            detail="Single submission policy: use Edit Submission to update your work.",
        )

    saved_path: Path | None = None
    original_filename = None
    stored_filename = None

    if file is not None:
        original_filename, stored_filename, saved_path = await save_uploaded_file(file)

    try:
        now = datetime.now(timezone.utc)
        if existing is None:
            submission = Submission(
                assignment_id=assignment_id,
                student_id=current_user.id,
                text_response=text_response,
                original_filename=original_filename,
                stored_filename=stored_filename,
            )
            db.add(submission)
            db.flush()  # Get the ID before inserting Attempt 1.
            make_new_attempt(db, submission, attempt_number=1)
        else:
            # Backfill before modifying a legacy submission's current values.
            previous = ensure_initial_attempt(db, existing)
            existing.text_response = text_response
            existing.original_filename = original_filename
            existing.stored_filename = stored_filename
            existing.submitted_at = now
            existing.updated_at = now
            if was_withdrawn:
                existing.is_withdrawn = False
            clear_previous_grade(existing)
            make_new_attempt(
                db,
                existing,
                attempt_number=previous.attempt_number + 1,
            )
            submission = existing

        # Do not accept a late upload that crossed the deadline while writing.
        require_open_deadline(assignment)
        # Database commit is atomic for current submission + attempt history.
        db.commit()
        db.refresh(submission)
        return submission
    except IntegrityError:
        db.rollback()
        if saved_path is not None:
            saved_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=409,
            detail="A conflicting submission was saved. Reload and try again.",
        )
    except Exception:
        db.rollback()
        if saved_path is not None:
            saved_path.unlink(missing_ok=True)
        raise


@router.put("/{submission_id}", response_model=SubmissionRead)
async def update_submission(
    submission_id: int,
    text_response: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.STUDENT)),
):
    submission = (
        db.query(Submission)
        .filter(Submission.id == submission_id)
        .with_for_update()
        .first()
    )
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    if submission.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    assignment = get_assignment_or_404(submission.assignment_id, db)
    check_student_enrollment(assignment, current_user, db)
    require_open_deadline(assignment)

    if bool(getattr(submission, "is_withdrawn", False)):
        raise HTTPException(
            status_code=409,
            detail="This submission was previously withdrawn. Submit again before the deadline.",
        )

    if text_response is None and file is None:
        raise HTTPException(status_code=400, detail="No changes were provided")
    if file is None and text_response is not None and text_response == (submission.text_response or ""):
        raise HTTPException(status_code=400, detail="No changes detected")

    next_text = text_response if text_response is not None else submission.text_response
    if not (next_text and next_text.strip()) and file is None and not submission.stored_filename:
        raise HTTPException(
            status_code=400,
            detail="Provide a text response or keep an attached file",
        )

    # The first edit to an old submission creates a snapshot of the old data.
    current_attempt = ensure_initial_attempt(db, submission)

    saved_path: Path | None = None
    try:
        if file is not None:
            original_filename, stored_filename, saved_path = await save_uploaded_file(file)
            submission.original_filename = original_filename
            submission.stored_filename = stored_filename

        submission.text_response = next_text
        now = datetime.now(timezone.utc)
        submission.updated_at = now
        clear_previous_grade(submission)

        # Editing updates the latest attempt IN PLACE for both policies.
        # Earlier attempts and their filenames are not modified.
        # Preserve existing professor feedback; a previously reviewed edit
        # may require re-review. Submission.updated_at tracks the revision.
        current_attempt.text_response = submission.text_response
        current_attempt.original_filename = submission.original_filename
        current_attempt.stored_filename = submission.stored_filename
        # Keep original attempt.submitted_at and attempt_number unchanged.

        # Do not accept a late upload that crossed the deadline while writing.
        require_open_deadline(assignment)
        db.commit()
        db.refresh(submission)
        return submission
    except IntegrityError:
        db.rollback()
        if saved_path is not None:
            saved_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=409,
            detail="A conflicting update was saved. Reload and try again.",
        )
    except Exception:
        db.rollback()
        if saved_path is not None:
            saved_path.unlink(missing_ok=True)
        raise


@router.get("/my-submissions", response_model=list[SubmissionRead])
def get_my_submissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.STUDENT)),
):
    return (
        db.query(Submission)
        .filter(Submission.student_id == current_user.id)
        .order_by(Submission.submitted_at.desc())
        .all()
    )


@router.get("/assignments/{assignment_id}", response_model=list[SubmissionRead])
def get_assignment_submissions(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.PROFESSOR, UserRole.ADMIN)
    ),
):
    assignment = get_assignment_or_404(assignment_id, db)
    if current_user.role == UserRole.PROFESSOR:
        check_professor_access(assignment, current_user, db)
    return (
        db.query(Submission)
        .filter(Submission.assignment_id == assignment_id)
        .order_by(Submission.submitted_at.desc())
        .all()
    )


@router.get("/{submission_id}", response_model=SubmissionRead)
def get_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    submission = db.get(Submission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    if current_user.role == UserRole.STUDENT:
        if submission.student_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user.role == UserRole.PROFESSOR:
        assignment = get_assignment_or_404(submission.assignment_id, db)
        check_professor_access(assignment, current_user, db)
    elif current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Access denied")
    return submission


@router.put("/{submission_id}/grade", response_model=SubmissionRead)
def grade_submission(
    submission_id: int,
    data: GradeSubmission,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.PROFESSOR, UserRole.ADMIN)
    ),
):
    submission = (
        db.query(Submission)
        .filter(Submission.id == submission_id)
        .with_for_update()
        .first()
    )
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")

    assignment = get_assignment_or_404(submission.assignment_id, db)
    if current_user.role == UserRole.PROFESSOR:
        check_professor_access(assignment, current_user, db)
    require_closed_deadline(assignment)

    # Ensure a legacy submission has a recorded final attempt before grading.
    ensure_initial_attempt(db, submission)

    if data.score < 0 or data.score > assignment.max_score:
        raise HTTPException(
            status_code=400,
            detail=f"Score must be between 0 and {assignment.max_score}",
        )

    # Submission always mirrors the latest attempt. Older attempts have
    # professor comments but never final grades.
    submission.score = data.score
    submission.feedback = data.feedback
    submission.graded_by = current_user.id
    submission.graded_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return submission


@router.get("/{submission_id}/download")
def download_submission_file(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    submission = db.get(Submission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    assignment = get_assignment_or_404(submission.assignment_id, db)
    if current_user.role == UserRole.STUDENT:
        if submission.student_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied.")
    elif current_user.role == UserRole.PROFESSOR:
        check_professor_access(assignment, current_user, db)
    elif current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Access denied.")

    if not submission.stored_filename:
        raise HTTPException(
            status_code=404,
            detail="No file attached to this submission.",
        )

    stored_name = submission.stored_filename
    if Path(stored_name).name != stored_name:
        raise HTTPException(status_code=404, detail="Invalid stored filename.")
    file_path = UPLOAD_DIR / stored_name
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Submission file not found.")

    return FileResponse(
        path=file_path,
        filename=submission.original_filename or "submission",
        media_type="application/octet-stream",
    )
