
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.meeting import Meeting
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.user import User, UserRole
from app.schemas.meeting import MeetingCreate, MeetingUpdate, MeetingRead
from app.api.dependencies import get_current_user, require_roles

router = APIRouter(prefix="/api/meetings", tags=["Meetings"])


def check_course_access(course_id: int, user: User, db: Session):
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
        raise HTTPException(
            status_code=403,
            detail="You are not enrolled in this course",
        )

    return course


def get_meeting_or_404(meeting_id: int, db: Session):
    meeting = db.query(Meeting).filter(
        Meeting.id == meeting_id
    ).first()

    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    return meeting


def check_meeting_management(meeting: Meeting, user: User, db: Session):
    check_course_access(meeting.course_id, user, db)


@router.post(
    "/courses/{course_id}",
    response_model=MeetingRead,
    status_code=status.HTTP_201_CREATED,
)
def create_meeting(
    course_id: int,
    data: MeetingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.PROFESSOR, UserRole.ADMIN)
    ),
):
    course = check_course_access(course_id, current_user, db)

    meeting = Meeting(
        **data.model_dump(),
        course_id=course.id,
        created_by=current_user.id,
        status="scheduled",
    )

    db.add(meeting)
    db.commit()
    db.refresh(meeting)

    return meeting


@router.get(
    "/courses/{course_id}",
    response_model=list[MeetingRead],
)
def list_course_meetings(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_course_access(course_id, current_user, db)

    return (
        db.query(Meeting)
        .filter(Meeting.course_id == course_id)
        .order_by(Meeting.starts_at.asc())
        .all()
    )


@router.get("/{meeting_id}", response_model=MeetingRead)
def get_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meeting = get_meeting_or_404(meeting_id, db)

    check_meeting_management(meeting, current_user, db)

    return meeting


@router.put("/{meeting_id}", response_model=MeetingRead)
def update_meeting(
    meeting_id: int,
    data: MeetingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.PROFESSOR, UserRole.ADMIN)
    ),
):
    meeting = get_meeting_or_404(meeting_id, db)

    check_meeting_management(meeting, current_user, db)

    updates = data.model_dump(exclude_unset=True)

    new_start = updates.get("starts_at", meeting.starts_at)
    new_end = updates.get("ends_at", meeting.ends_at)

    if new_end <= new_start:
        raise HTTPException(
            status_code=400,
            detail="Meeting end time must be after start time",
        )

    if "status" in updates and updates["status"] not in {
        "scheduled", "cancelled", "completed"
    }:
        raise HTTPException(
            status_code=400,
            detail="Invalid meeting status",
        )

    for field, value in updates.items():
        setattr(meeting, field, value)

    db.commit()
    db.refresh(meeting)

    return meeting


@router.delete("/{meeting_id}", response_model=MeetingRead)
def cancel_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.PROFESSOR, UserRole.ADMIN)
    ),
):
    meeting = get_meeting_or_404(meeting_id, db)

    check_meeting_management(meeting, current_user, db)

    meeting.status = "cancelled"

    db.commit()
    db.refresh(meeting)

    return meeting

