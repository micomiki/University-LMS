
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    Numeric,
    CheckConstraint,
    func
)

from app.db.session import Base


class Assignment(Base):
    __tablename__ = "assignments"

    __table_args__ = (
        CheckConstraint(
            "max_score > 0",
            name="check_assignment_max_score"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)

    due_at = Column(DateTime(timezone=True), nullable=False)

    max_score = Column(Numeric(8, 2), nullable=False, default=100)

    course_id = Column(
        Integer,
        ForeignKey("courses.id"),
        nullable=False,
        index=True
    )

    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

