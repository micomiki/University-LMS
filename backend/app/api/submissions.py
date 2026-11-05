
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from app.schemas.grading import GradeSubmission
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    status,
)
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.submission import Submission
from app.models.enrollment import Enrollment
from app.models.user import User, UserRole
from app.models.course import Course
from app.schemas.submission import SubmissionRead
from app.api.dependencies import get_current_user, require_roles

router = APIRouter(prefix="/api/submissions", tags=["Submissions"])

UPLOAD_DIR = Path("uploads/assignment_submissions")
MAX_FILE_SIZE = 20 * 1024 * 1024

ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".ppt", ".pptx",
    ".txt", ".csv", ".xls", ".xlsx",
    ".png", ".jpg", ".jpeg",
}


def get_assignment_or_404(assignment_id: int, db: Session):
    assignment = db.query(Assignment).filter(
        Assignment.id == assignment_id
    ).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    return assignment


def check_student_enrollment(
    assignment: Assignment,
    student: User,
    db: Session,
):
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
):
    course = db.query(Course).filter(
        Course.id == assignment.course_id
    ).first()

    if not course or course.professor_id != professor.id:
        raise HTTPException(status_code=403, detail="Access denied")


def validate_file(file: UploadFile):
    extension = Path(file.filename or "").suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="File type is not allowed",
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

    existing = db.query(Submission).filter(
        Submission.assignment_id == assignment_id,
        Submission.student_id == current_user.id,
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail="You have already submitted this assignment. Use the update endpoint.",
        )

    if not text_response and not file:
        raise HTTPException(
            status_code=400,
            detail="Provide a text response or upload a file",
        )

    stored_filename = None
    original_filename = None
    saved_path = None

    if file:
        validate_file(file)

        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

        extension = Path(file.filename or "").suffix.lower()
        stored_filename = f"{uuid.uuid4().hex}{extension}"
        original_filename = os.path.basename(file.filename or "submission")
        saved_path = UPLOAD_DIR / stored_filename

        size = 0

        try:
            with saved_path.open("wb") as output:
                while chunk := await file.read(1024 * 1024):
                    size += len(chunk)

                    if size > MAX_FILE_SIZE:
                        raise HTTPException(
                            status_code=413,
                            detail="File exceeds the 20 MB limit",
                        )

                    output.write(chunk)

        except Exception:
            if saved_path.exists():
                saved_path.unlink()
            raise
        finally:
            await file.close()

    submission = Submission(
        assignment_id=assignment_id,
        student_id=current_user.id,
        text_response=text_response,
        original_filename=original_filename,
        stored_filename=stored_filename,
    )

    try:
        db.add(submission)
        db.commit()
        db.refresh(submission)
    except Exception:
        db.rollback()
        if saved_path and saved_path.exists():
            saved_path.unlink()
        raise

    return submission


@router.put("/{submission_id}", response_model=SubmissionRead)
async def update_submission(
    submission_id: int,
    text_response: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.STUDENT)),
):
    submission = db.query(Submission).filter(
        Submission.id == submission_id
    ).first()

    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if submission.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    assignment = get_assignment_or_404(submission.assignment_id, db)

    if file:
        validate_file(file)

    if text_response is not None:
        submission.text_response = text_response

    new_path = None
    old_path = (
        UPLOAD_DIR / submission.stored_filename
        if submission.stored_filename
        else None
    )

    if file:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

        extension = Path(file.filename or "").suffix.lower()
        new_filename = f"{uuid.uuid4().hex}{extension}"
        new_path = UPLOAD_DIR / new_filename

        size = 0

        try:
            with new_path.open("wb") as output:
                while chunk := await file.read(1024 * 1024):
                    size += len(chunk)

                    if size > MAX_FILE_SIZE:
                        raise HTTPException(
                            status_code=413,
                            detail="File exceeds the 20 MB limit",
                        )

                    output.write(chunk)

        except Exception:
            if new_path.exists():
                new_path.unlink()
            raise
        finally:
            await file.close()

        submission.stored_filename = new_filename
        submission.original_filename = os.path.basename(
            file.filename or "submission"
        )

    try:
        db.commit()
        db.refresh(submission)
    except Exception:
        db.rollback()
        if new_path and new_path.exists():
            new_path.unlink()
        raise

    if new_path and old_path and old_path.exists():
        old_path.unlink()

    return submission


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


@router.get(
    "/assignments/{assignment_id}",
    response_model=list[SubmissionRead],
)
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
    submission = db.query(Submission).filter(
        Submission.id == submission_id
    ).first()

    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if current_user.role == UserRole.STUDENT:
        if submission.student_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    elif current_user.role == UserRole.PROFESSOR:
        assignment = get_assignment_or_404(submission.assignment_id, db)
        check_professor_access(assignment, current_user, db)

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
    submission = db.query(Submission).filter(
        Submission.id == submission_id
    ).first()

    if not submission:
        raise HTTPException(
            status_code=404,
            detail="Submission not found",
        )

    assignment = get_assignment_or_404(
        submission.assignment_id,
        db,
    )

    # Professors can grade only assignments in their own courses.
    if current_user.role == UserRole.PROFESSOR:
        check_professor_access(
            assignment,
            current_user,
            db,
        )

    # Validate the score against the assignment's maximum score.
    if data.score > assignment.max_score:
        raise HTTPException(
            status_code=400,
            detail=f"Score cannot exceed {assignment.max_score}",
        )

    submission.score = data.score
    submission.feedback = data.feedback
    submission.graded_by = current_user.id
    submission.graded_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(submission)

    return submission

