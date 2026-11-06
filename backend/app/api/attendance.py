
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.schemas.attendance import AttendanceRosterItem
from app.db.session import get_db
from app.api.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.meeting import Meeting
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.attendance import Attendance
from app.schemas.attendance import (
    AttendanceCreate,
    AttendanceUpdate,
    AttendanceRead,
)

router = APIRouter(
    prefix="/api/attendance",
    tags=["Attendance"],
)


@router.post(
    "/meetings/{meeting_id}",
    response_model=AttendanceRead,
)
def mark_attendance(
    meeting_id: int,
    data: AttendanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meeting = db.query(Meeting).filter(
        Meeting.id == meeting_id
    ).first()

    if not meeting:
        raise HTTPException(
            status_code=404,
            detail="Meeting not found.",
        )

    if current_user.role == UserRole.PROFESSOR:
        course = db.query(Course).filter(
            Course.id == meeting.course_id
        ).first()

        if not course or course.professor_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied.",
            )

    elif current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Access denied.",
        )

    enrollment = db.query(Enrollment).filter(
        Enrollment.course_id == meeting.course_id,
        Enrollment.student_id == data.student_id,
    ).first()

    if not enrollment:
        raise HTTPException(
            status_code=400,
            detail="This student is not enrolled in the course.",
        )

    existing = db.query(Attendance).filter(
        Attendance.meeting_id == meeting_id,
        Attendance.student_id == data.student_id,
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Attendance has already been marked for this student.",
        )

    attendance = Attendance(
        meeting_id=meeting_id,
        student_id=data.student_id,
        status=data.status,
        marked_by=current_user.id,
    )

    db.add(attendance)
    db.commit()
    db.refresh(attendance)

    return attendance


@router.get(
    "/meetings/{meeting_id}",
    response_model=list[AttendanceRead],
)
def get_meeting_attendance(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meeting = db.query(Meeting).filter(
        Meeting.id == meeting_id
    ).first()

    if not meeting:
        raise HTTPException(
            status_code=404,
            detail="Meeting not found.",
        )

    if current_user.role == UserRole.PROFESSOR:
        course = db.query(Course).filter(
            Course.id == meeting.course_id
        ).first()

        if not course or course.professor_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied.",
            )

    elif current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Access denied.",
        )

    return db.query(Attendance).filter(
        Attendance.meeting_id == meeting_id
    ).all()


@router.get(
    "/my-attendance",
    response_model=list[AttendanceRead],
)
def get_my_attendance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=403,
            detail="Only students can access this endpoint.",
        )

    return db.query(Attendance).filter(
        Attendance.student_id == current_user.id
    ).all()


@router.put(
    "/{attendance_id}",
    response_model=AttendanceRead,
)
def update_attendance(
    attendance_id: int,
    data: AttendanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attendance = db.query(Attendance).filter(
        Attendance.id == attendance_id
    ).first()

    if not attendance:
        raise HTTPException(
            status_code=404,
            detail="Attendance record not found.",
        )

    meeting = db.query(Meeting).filter(
        Meeting.id == attendance.meeting_id
    ).first()

    if current_user.role == UserRole.PROFESSOR:
        course = db.query(Course).filter(
            Course.id == meeting.course_id
        ).first()

        if not course or course.professor_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied.",
            )

    elif current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Access denied.",
        )

    attendance.status = data.status
    attendance.marked_by = current_user.id

    db.commit()
    db.refresh(attendance)

    return attendance

@router.get(
    "/meetings/{meeting_id}/roster",
    response_model=list[AttendanceRosterItem],
)
def get_meeting_roster(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meeting = db.query(Meeting).filter(
        Meeting.id == meeting_id
    ).first()

    if not meeting:
        raise HTTPException(
            status_code=404,
            detail="Meeting not found.",
        )

    # Only administrators and the assigned professor
    # can access the attendance roster.
    if current_user.role == UserRole.PROFESSOR:
        course = db.query(Course).filter(
            Course.id == meeting.course_id
        ).first()

        if not course or course.professor_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied.",
            )

    elif current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Access denied.",
        )

    # Include all enrolled students, even if their
    # attendance has not been marked.
    rows = (
        db.query(User, Attendance)
        .join(
            Enrollment,
            Enrollment.student_id == User.id,
        )
        .outerjoin(
            Attendance,
            and_(
                Attendance.student_id == User.id,
                Attendance.meeting_id == meeting_id,
            ),
        )
        .filter(
            Enrollment.course_id == meeting.course_id,
            User.role == UserRole.STUDENT,
        )
        .order_by(User.full_name)
        .all()
    )

    return [
        AttendanceRosterItem(
            student_id=student.id,
            full_name=student.full_name,
            attendance_id=attendance.id if attendance else None,
            status=attendance.status if attendance else None,
        )
        for student, attendance in rows
    ]

