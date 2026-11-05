
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    CheckConstraint,
    func,
)

from app.db.session import Base


class Meeting(Base):
    __tablename__ = "meetings"

    __table_args__ = (
        CheckConstraint(
            "ends_at > starts_at",
            name="check_meeting_end_after_start",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String(200), nullable=False)

    description = Column(Text, nullable=True)

    starts_at = Column(DateTime(timezone=True), nullable=False)

    ends_at = Column(DateTime(timezone=True), nullable=False)

    meeting_url = Column(String(1000), nullable=True)

    status = Column(
        String(20),
        nullable=False,
        default="scheduled",
    )

    course_id = Column(
        Integer,
        ForeignKey("courses.id"),
        nullable=False,
        index=True,
    )

    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

