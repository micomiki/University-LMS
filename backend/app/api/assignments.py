
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.models.submission import Submission
from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.user import User, UserRole
from app.schemas.assignment import (
    AssignmentCreate,
    AssignmentUpdate,
    AssignmentRead,
)
from app.api.dependencies import get_current_user, require_roles

router = APIRouter(prefix="/api/assignments", tags=["Assignments"])


def check_course_access(
    course_id: int,
    user: User,
    db: Session,
) -> Course:
    course = db.query(Course).filter(Course.id == course_id).first()

    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if user.role == UserRole.ADMIN:
        return course

    if user.role == UserRole.PROFESSOR:
        if course.professor_id != user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        return course

    enrollment = db.query(Enrollment).filter(
        Enrollment.course_id == course_id,
        Enrollment.student_id == user.id,
    ).first()

    if not enrollment:
        raise HTTPException(status_code=403, detail="You are not enrolled in this course")

    return course


@router.post(
    "/courses/{course_id}",
    response_model=AssignmentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_assignment(
    course_id: int,
    data: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.PROFESSOR, UserRole.ADMIN)
    ),
):
    course = check_course_access(course_id, current_user, db)

    assignment = Assignment(
        **data.model_dump(),
        course_id=course.id,
        created_by=current_user.id,
        
    )

    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    return assignment


@router.get(
    "/courses/{course_id}",
    response_model=list[AssignmentRead],
)
def list_assignments(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_course_access(course_id, current_user, db)

    return (
        db.query(Assignment)
        .filter(Assignment.course_id == course_id)
        .order_by(Assignment.due_at.asc())
        .all()
    )


@router.get("/{assignment_id}", response_model=AssignmentRead)
def get_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    assignment = db.query(Assignment).filter(
        Assignment.id == assignment_id
    ).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    check_course_access(assignment.course_id, current_user, db)

    return assignment


@router.put("/{assignment_id}", response_model=AssignmentRead)
def update_assignment(
    assignment_id: int,
    data: AssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.PROFESSOR, UserRole.ADMIN)
    ),
):
    assignment = db.query(Assignment).filter(
        Assignment.id == assignment_id
    ).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    check_course_access(assignment.course_id, current_user, db)

    updates = data.model_dump(exclude_unset=True)

    for field, value in updates.items():
        setattr(assignment, field, value)

    db.commit()
    db.refresh(assignment)

    return assignment



@router.delete("/{assignment_id}")
def delete_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    assignment = db.get(Assignment, assignment_id)

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found.",
        )

    course = db.get(Course, assignment.course_id)

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found.",
        )

    # Only admins or the assigned professor can delete.
    if current_user.role == UserRole.PROFESSOR:
        if course.professor_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You cannot delete this assignment.",
            )

    elif current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Only professors and admins can delete assignments.",
        )

    # Protect student submissions and grades.
    existing_submission = (
        db.query(Submission.id)
        .filter(
            Submission.assignment_id == assignment_id
        )
        .first()
    )

    if existing_submission is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "This assignment has student submissions "
                "and cannot be deleted."
            ),
        )

    try:
        db.delete(assignment)
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail=(
                "This assignment has related records "
                "and cannot be deleted."
            ),
        )

    return {
        "message": "Assignment deleted successfully."
    }

