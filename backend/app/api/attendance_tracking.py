
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.course import Course
from app.models.meeting import Meeting
from app.models.enrollment import Enrollment
from app.models.attendance_session import AttendanceSession


router = APIRouter(
    prefix="/api/attendance-tracking",
    tags=["Automatic Attendance"],
)

HEARTBEAT_TIMEOUT = timedelta(seconds=90)
LEAVE_GRACE = timedelta(seconds=45)
PRESENT_PERCENT = 70
LATE_MINUTES = 10


def utc_now():
    return datetime.now(timezone.utc)


def get_meeting(db: Session, meeting_id: int):
    meeting = db.get(Meeting, meeting_id)

    if not meeting:
        raise HTTPException(404, "Meeting not found.")

    return meeting


def require_enrolled_student(
    db: Session,
    meeting: Meeting,
    user: User,
):
    if user.role != UserRole.STUDENT:
        raise HTTPException(403, "Student access required.")

    enrollment = (
        db.query(Enrollment)
        .filter(
            Enrollment.student_id == user.id,
            Enrollment.course_id == meeting.course_id,
        )
        .first()
    )

    if not enrollment:
        raise HTTPException(403, "Student is not enrolled.")


def require_course_manager(
    db: Session,
    meeting: Meeting,
    user: User,
):
    if user.role == UserRole.ADMIN:
        return

    if user.role == UserRole.PROFESSOR:
        course = db.get(Course, meeting.course_id)

        if course and course.professor_id == user.id:
            return

    raise HTTPException(403, "Access denied.")


def get_owned_session(
    db: Session,
    session_id: int,
    user: User,
):
    session = db.get(AttendanceSession, session_id)

    if not session or session.student_id != user.id:
        raise HTTPException(404, "Session not found.")

    return session


@router.post("/meetings/{meeting_id}/join")
def record_join(
    meeting_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    meeting = get_meeting(db, meeting_id)
    require_enrolled_student(db, meeting, user)

    now = utc_now()

    if meeting.status != "scheduled":
        raise HTTPException(409, "Meeting is not scheduled.")

    if not meeting.meeting_url:
        raise HTTPException(409, "Video room is not configured.")

    # Allow early joining within 15 minutes.
    if now < meeting.starts_at - timedelta(minutes=15):
        raise HTTPException(409, "Meeting has not started.")

    if now >= meeting.ends_at:
        raise HTTPException(409, "Meeting has ended.")

    # Close previous open sessions to avoid overlapping time.
    previous = (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.meeting_id == meeting_id,
            AttendanceSession.student_id == user.id,
            AttendanceSession.left_at.is_(None),
        )
        .all()
    )

    for old in previous:
        old.left_at = min(old.last_seen_at, meeting.ends_at)

    session = AttendanceSession(
        meeting_id=meeting_id,
        student_id=user.id,
        joined_at=now,
        last_seen_at=now,
    )

    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "session_id": session.id,
        "joined_at": session.joined_at,
    }


@router.post("/sessions/{session_id}/heartbeat")
def record_heartbeat(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = get_owned_session(db, session_id, user)
    meeting = get_meeting(db, session.meeting_id)

    if session.left_at is not None:
        raise HTTPException(409, "Session is closed.")

    now = utc_now()

    if now - session.last_seen_at > HEARTBEAT_TIMEOUT:
        session.left_at = session.last_seen_at
        db.commit()
        raise HTTPException(409, "Session expired.")

    if now >= meeting.ends_at:
        session.left_at = min(
            session.last_seen_at,
            meeting.ends_at,
        )
        db.commit()
        raise HTTPException(409, "Meeting has ended.")

    session.last_seen_at = now

    db.commit()

    return {"status": "active"}


@router.post("/sessions/{session_id}/leave")
def record_leave(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = get_owned_session(db, session_id, user)

    if session.left_at is None:
        meeting = get_meeting(db, session.meeting_id)

        # Cap late leave requests after disconnection.
        session.left_at = max(
            session.joined_at,
            min(
                utc_now(),
                session.last_seen_at + LEAVE_GRACE,
                meeting.ends_at,
            ),
        )

        db.commit()

    return {
        "status": "closed",
        "left_at": session.left_at,
    }


@router.get("/meetings/{meeting_id}/report")
def automatic_attendance_report(
    meeting_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    meeting = get_meeting(db, meeting_id)
    require_course_manager(db, meeting, user)

    students = (
        db.query(User)
        .join(
            Enrollment,
            Enrollment.student_id == User.id,
        )
        .filter(
            Enrollment.course_id == meeting.course_id,
            User.role == UserRole.STUDENT,
        )
        .order_by(User.full_name)
        .all()
    )

    sessions = (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.meeting_id == meeting_id
        )
        .order_by(AttendanceSession.joined_at)
        .all()
    )

    duration = (
        meeting.ends_at - meeting.starts_at
    ).total_seconds()

    report = []

    for student in students:
        records = [
            s for s in sessions
            if s.student_id == student.id
        ]

        # Count time within the scheduled class only.
        intervals = []

        for record in records:
            start = max(
                record.joined_at,
                meeting.starts_at,
            )

            end = min(
                record.left_at or record.last_seen_at,
                meeting.ends_at,
            )

            if end > start:
                intervals.append((start, end))

        # Merge overlapping intervals.
        intervals.sort()
        merged = []

        for start, end in intervals:
            if merged and start <= merged[-1][1]:
                old_start, old_end = merged[-1]
                merged[-1] = (
                    old_start,
                    max(old_end, end),
                )
            else:
                merged.append((start, end))

        total_seconds = sum(
            (end - start).total_seconds()
            for start, end in merged
        )

        percentage = (
            min(100, total_seconds / duration * 100)
            if duration > 0
            else 0
        )

        first_joined = (
            min(s.joined_at for s in records)
            if records else None
        )

        last_activity = (
            max(
                s.left_at or s.last_seen_at
                for s in records
            )
            if records else None
        )

        if meeting.status == "cancelled":
            detected_status = "cancelled"

        elif utc_now() < meeting.ends_at:
            detected_status = (
                "in_progress" if records else "not_joined"
            )

        elif not records or total_seconds == 0:
            detected_status = "absent"

        elif percentage < PRESENT_PERCENT:
            detected_status = "partial"

        elif first_joined and first_joined > (
            meeting.starts_at
            + timedelta(minutes=LATE_MINUTES)
        ):
            detected_status = "late"

        else:
            detected_status = "present"

        report.append({
            "student_id": student.id,
            "full_name": student.full_name,
            "first_joined_at": first_joined,
            "last_activity_at": last_activity,
            "minutes_connected": round(
                total_seconds / 60, 1
            ),
            "attendance_percent": round(
                percentage, 1
            ),
            "detected_status": detected_status,
        })

    return report

