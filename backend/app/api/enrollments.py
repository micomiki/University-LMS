
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User, UserRole
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.schemas.enrollment import EnrollmentCreate, EnrollmentRead


router = APIRouter(
    prefix="/api/enrollments",
    tags=["Enrollment Management"]
)


# 1. Enroll a student in a course
@router.post(
    "/",
    response_model=EnrollmentRead,
    status_code=status.HTTP_201_CREATED
)
def create_enrollment(
    data: EnrollmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Determine which student is being enrolled.
    if current_user.role == UserRole.STUDENT:
        if data.student_id is not None and data.student_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only enroll yourself"
            )

        student_id = current_user.id

    elif current_user.role == UserRole.ADMIN:
        if data.student_id is None:
            raise HTTPException(
                status_code=400,
                detail="Administrator must provide a student ID"
            )

        student_id = data.student_id

    else:
        raise HTTPException(
            status_code=403,
            detail="Only students and administrators can create enrollments"
        )

    # Verify student account.
    student = db.get(User, student_id)

    if (
        student is None
        or student.role != UserRole.STUDENT
        or not student.is_active
    ):
        raise HTTPException(
            status_code=404,
            detail="Active student account not found"
        )

    # Verify course.
    course = db.get(Course, data.course_id)

    if course is None:
        raise HTTPException(
            status_code=404,
            detail="Course not found"
        )

    # Prevent duplicate enrollment.
    existing = db.scalar(
        select(Enrollment).where(
            Enrollment.student_id == student_id,
            Enrollment.course_id == data.course_id
        )
    )

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Student is already enrolled in this course"
        )

    enrollment = Enrollment(
        student_id=student_id,
        course_id=data.course_id
    )

    db.add(enrollment)

    try:
        db.commit()
        db.refresh(enrollment)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This enrollment already exists"
        )

    return enrollment


# 2. List enrollments according to user role
@router.get("/", response_model=list[EnrollmentRead])
def list_enrollments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    statement = select(Enrollment)

    if current_user.role == UserRole.STUDENT:
        statement = statement.where(
            Enrollment.student_id == current_user.id
        )

    elif current_user.role == UserRole.PROFESSOR:
        statement = statement.join(
            Course,
            Enrollment.course_id == Course.id
        ).where(
            Course.professor_id == current_user.id
        )

    # Administrators can see all enrollments.

    statement = statement.order_by(Enrollment.id)

    return db.scalars(statement).all()


# 3. View an individual enrollment
@router.get("/{enrollment_id}", response_model=EnrollmentRead)
def get_enrollment(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    enrollment = db.get(Enrollment, enrollment_id)

    if enrollment is None:
        raise HTTPException(
            status_code=404,
            detail="Enrollment not found"
        )

    if current_user.role == UserRole.STUDENT:
        if enrollment.student_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You cannot access this enrollment"
            )

    elif current_user.role == UserRole.PROFESSOR:
        course = db.get(Course, enrollment.course_id)

        if course.professor_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="This enrollment is not in your course"
            )

    return enrollment

