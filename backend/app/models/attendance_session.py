
from sqlalchemy import (
    Column,
    Integer,
    DateTime,
    ForeignKey,
)

from app.db.session import Base


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id = Column(Integer, primary_key=True, index=True)

    meeting_id = Column(
        Integer,
        ForeignKey("meetings.id"),
        nullable=False,
        index=True,
    )

    student_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    joined_at = Column(DateTime(timezone=True), nullable=False)

    last_seen_at = Column(DateTime(timezone=True), nullable=False)

    left_at = Column(DateTime(timezone=True), nullable=True)

