
from sqlalchemy import (
    Column,
    Integer,
    Text,
    String,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    func,
)

from app.db.session import Base


class SubmissionAttempt(Base):
    __tablename__ = "submission_attempts"

    __table_args__ = (
        UniqueConstraint(
            "submission_id",
            "attempt_number",
            name="unique_submission_attempt_number",
        ),
    )

    id = Column(Integer, primary_key=True)

    submission_id = Column(
        Integer,
        ForeignKey("submissions.id"),
        nullable=False,
        index=True,
    )

    attempt_number = Column(Integer, nullable=False)

    text_response = Column(Text, nullable=True)

    original_filename = Column(
        String(255),
        nullable=True,
    )

    stored_filename = Column(
        String(255),
        nullable=True,
    )

    submitted_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

