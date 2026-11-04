
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User, UserRole
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.schemas.course import CourseCreate, CourseUpdate, CourseRead


router = APIRouter(
    prefix="/api/courses",
    tags=["Course Management"]
)


def verify_professor(db: Session, professor_id: int):
    professor = db.get(User, professor_id)

    if professor is None or professor.role != UserRole.PROFESSOR:
        raise HTTPException(
            status_code=400,
            detail="The selected professor does not exist"
        )

    if not professor.is_active:
        raise HTTPException(
            status_code=400,
            detail="The selected professor account is inactive"
        )

    return professor


# 1. Create a course (ADMIN only)
@router.post(
    "/",
    response_model=CourseRead,
    status_code=status.HTTP_201_CREATED
)
def create_course(
    data: CourseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Administrator access required")

    verify_professor(db, data.professor_id)

    existing_course = db.scalar(
        select(Course).where(
            Course.course_code == data.course_code
        )
    )

    if existing_course:
        raise HTTPException(
            status_code=409,
            detail="A course with this course code already exists"
        )

    course = Course(
        title=data.title,
        description=data.description,
        course_code=data.course_code,
        professor_id=data.professor_id
    )

    db.add(course)
    db.commit()
    db.refresh(course)

    return course


# 2. List courses
@router.get("/", response_model=list[CourseRead])
def list_courses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    statement = select(Course).order_by(Course.id)

    if current_user.role == UserRole.PROFESSOR:
        statement = statement.where(
            Course.professor_id == current_user.id
        )

    # Administrators see all courses.
    # Students can browse the course catalogue.
    return db.scalars(statement).all()


# 3. View an individual course
@router.get("/{course_id}", response_model=CourseRead)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = db.get(Course, course_id)

    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    if (
        current_user.role == UserRole.PROFESSOR
        and course.professor_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="This course is not assigned to you")

    return course


# 4. Update a course
@router.put("/{course_id}", response_model=CourseRead)
def update_course(
    course_id: int,
    data: CourseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = db.get(Course, course_id)

    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    if current_user.role not in [UserRole.ADMIN, UserRole.PROFESSOR]:
        raise HTTPException(status_code=403, detail="Access denied")

    if (
        current_user.role == UserRole.PROFESSOR
        and course.professor_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="You cannot update this course")

    changes = data.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(status_code=400, detail="No update information provided")

    # Only administrators can assign or reassign professors.
    if "professor_id" in changes:
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=403,
                detail="Only administrators can assign professors"
            )

        if changes["professor_id"] is None:
            raise HTTPException(status_code=400, detail="Professor ID cannot be empty")

        verify_professor(db, changes["professor_id"])

    if "course_code" in changes and changes["course_code"] is not None:
        existing = db.scalar(
            select(Course).where(
                Course.course_code == changes["course_code"],
                Course.id != course_id
            )
        )

        if existing:
            raise HTTPException(
                status_code=409,
                detail="This course code is already in use"
            )

    for field, value in changes.items():
        setattr(course, field, value)

    db.commit()
    db.refresh(course)

    return course


# 5. Delete a course (ADMIN only)
@router.delete("/{course_id}")
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Administrator access required")

    course = db.get(Course, course_id)

    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    enrollment_count = db.scalar(
        select(func.count())
        .select_from(Enrollment)
        .where(Enrollment.course_id == course_id)
    )

    if enrollment_count:
        raise HTTPException(
            status_code=409,
            detail="This course has enrollments and cannot be deleted"
        )

    db.delete(course)
    db.commit()

    return {"message": "Course deleted successfully"}

