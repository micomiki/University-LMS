
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    func,
)

from app.db.session import Base


class Attendance(Base):
    __tablename__ = "attendance"

    __table_args__ = (
        UniqueConstraint(
            "meeting_id",
            "student_id",
            name="unique_meeting_student_attendance",
        ),
    )

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

    status = Column(
        String(20),
        nullable=False,
        default="present",
    )

    marked_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    marked_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

