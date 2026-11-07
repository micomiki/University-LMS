"""Stage 2B: database-level integration tests using the real LMS SQLAlchemy models.

Safety:
- Uses ONLY a database named university_lms_test.
- Creates a fresh, random schema for this test run; drops only that schema.
- Uses per-test outer transactions rolled back after each test.
- Never creates the test database and never connects to university_lms.

Run from backend/:
    python -m pytest -v tests/test_postgres_submission_integrity.py
"""

import importlib
import os
import pkgutil
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    Float,
    Integer,
    LargeBinary,
    Numeric,
    String,
    create_engine,
    text,
)
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import session as session_module
from app.db.session import Base
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.submission import Submission
from app.models.submission_attempt import SubmissionAttempt
from app.models.user import User, UserRole


TEST_DB_NAME = "university_lms_test"


def _test_database_url():
    """Derive connection credentials without opening the application's database."""
    explicit_url = os.getenv("LMS_TEST_DATABASE_URL")
    if explicit_url:
        url = make_url(explicit_url)
    else:
        app_engine = getattr(session_module, "engine", None)
        if app_engine is None:
            session_factory = getattr(session_module, "SessionLocal", None)
            app_engine = getattr(session_factory, "kw", {}).get("bind")
        if app_engine is None:
            raise RuntimeError(
                "Cannot find the application's SQLAlchemy engine. "
                "Set LMS_TEST_DATABASE_URL to the test database URL."
            )
        # URL.set() changes the database name; it does NOT connect to production.
        url = app_engine.url.set(database=TEST_DB_NAME)

    if url.get_backend_name() != "postgresql" or url.database != TEST_DB_NAME:
        raise RuntimeError(
            f"REFUSING to run: Stage 2B requires PostgreSQL database '{TEST_DB_NAME}', "
            "not the database supplied in the URL."
        )
    return url


def _import_all_models():
    """Register every model's SQLAlchemy tables/foreign keys with Base.metadata."""
    import app.models as models_package

    for info in pkgutil.iter_modules(models_package.__path__):
        if not info.name.startswith("_"):
            importlib.import_module(f"app.models.{info.name}")


def _sample_value(column, seed):
    """Fill required non-FK columns when the LMS adds nonessential model fields."""
    key = column.key.lower()
    type_ = column.type

    if "email" in key:
        value = f"lms-test-{seed}@example.test"
    elif "password" in key:
        value = "test-hash-not-for-login"
    elif "username" in key or "user_name" in key:
        value = f"user_{seed}"
    elif "code" in key or "slug" in key:
        value = f"test-{seed}"
    elif "name" in key or "title" in key:
        value = f"LMS Test {seed}"
    elif isinstance(type_, SAEnum):
        value = list(type_.enum_class)[0] if type_.enum_class else type_.enums[0]
    elif isinstance(type_, Boolean):
        value = True
    elif isinstance(type_, Integer):
        value = 1
    elif isinstance(type_, (Numeric, Float)):
        value = Decimal("1")
    elif isinstance(type_, DateTime):
        value = datetime.now(timezone.utc)
    elif isinstance(type_, Date):
        value = date.today()
    elif isinstance(type_, LargeBinary):
        value = b"test"
    else:
        value = f"LMS test {seed}"

    if isinstance(type_, String) and type_.length and isinstance(value, str):
        value = value[:type_.length]
    return value


def _insert(db, model, **values):
    """Insert with actual mapped fields; fail visibly for unknown required relationships."""
    columns = {column.key: column for column in model.__table__.columns}
    seed = uuid.uuid4().hex[:10]
    args = {key: value for key, value in values.items() if key in columns}

    for key, column in columns.items():
        if key in args or column.primary_key or column.nullable:
            continue
        if column.default is not None or column.server_default is not None:
            continue
        if column.foreign_keys:
            raise AssertionError(
                f"{model.__name__}.{key} is a required FK not supplied by the "
                "test fixture. Add the related parent fixture, then supply this value."
            )
        args[key] = _sample_value(column, seed)

    record = model(**args)
    db.add(record)
    db.flush()
    return record


@pytest.fixture(scope="session")
def pg_engine():
    """Create tables only in a random schema of the named TEST database."""
    url = _test_database_url()
    admin_engine = create_engine(url, pool_pre_ping=True)
    schema = "lms_it_" + uuid.uuid4().hex[:12]
    schema_created = False
    schema_engine = None

    try:
        # Check the ACTUAL connected database, not just the URL string.
        with admin_engine.begin() as connection:
            actual_db = connection.execute(text("SELECT current_database()" )).scalar_one()
            if actual_db != TEST_DB_NAME:
                raise RuntimeError(f"REFUSING to run against '{actual_db}'")
            connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
            schema_created = True

        _import_all_models()
        schema_engine = create_engine(
            url,
            pool_pre_ping=True,
            connect_args={"options": f"-csearch_path={schema},public"},
        )
        with schema_engine.connect() as connection:
            assert connection.execute(text("SELECT current_database()" )).scalar_one() == TEST_DB_NAME
            assert connection.execute(text("SELECT current_schema()" )).scalar_one() == schema

        # create_all validates the actual ORM table definitions, not Alembic revisions.
        Base.metadata.create_all(schema_engine)
        yield schema_engine
    finally:
        if schema_engine is not None:
            schema_engine.dispose()
        if schema_created:
            with admin_engine.begin() as connection:
                if connection.execute(text("SELECT current_database()" )).scalar_one() != TEST_DB_NAME:
                    raise RuntimeError("Unexpected database during cleanup; refusing DROP")
                # Only a random, freshly created schema can be removed.
                connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
        admin_engine.dispose()


@pytest.fixture
def db(pg_engine):
    """All commits in a test stay inside an outer transaction, then roll back."""
    connection = pg_engine.connect()
    outer_transaction = connection.begin()
    session = Session(
        bind=connection,
        join_transaction_mode="create_savepoint",
        expire_on_commit=False,
    )
    try:
        yield session
    finally:
        session.close()
        if outer_transaction.is_active:
            outer_transaction.rollback()
        connection.close()


@pytest.fixture
def records(db):
    professor = _insert(
        db, User,
        role=UserRole.PROFESSOR,
        email=f"prof-{uuid.uuid4().hex}@example.test",
        full_name="Stage2B Professor",
        name="Stage2B Professor",
        password_hash="not-a-real-password-hash",
        hashed_password="not-a-real-password-hash",
        is_active=True,
    )
    student = _insert(
        db, User,
        role=UserRole.STUDENT,
        email=f"student-{uuid.uuid4().hex}@example.test",
        full_name="Stage2B Student",
        name="Stage2B Student",
        password_hash="not-a-real-password-hash",
        hashed_password="not-a-real-password-hash",
        is_active=True,
    )
    course = _insert(
        db, Course,
        professor_id=professor.id,
        created_by=professor.id,
        name="Stage2B Python",
        title="Stage2B Python",
        code=f"TST-{uuid.uuid4().hex[:7]}",
    )
    assignment = _insert(
        db, Assignment,
        course_id=course.id,
        created_by=professor.id,
        title="Stage2B Database Test",
        description="Disposable test assignment",
        instructions="Submit a file or text",
        due_at=datetime.now(timezone.utc) + timedelta(days=1),
        max_score=Decimal("100"),
        allow_multiple_submissions=True,
    )
    submission = _insert(
        db, Submission,
        assignment_id=assignment.id,
        student_id=student.id,
        text_response="Version one",
    )
    attempt1 = _insert(
        db, SubmissionAttempt,
        submission_id=submission.id,
        attempt_number=1,
        text_response="Version one",
    )
    return {
        "professor": professor,
        "student": student,
        "course": course,
        "assignment": assignment,
        "submission": submission,
        "attempt1": attempt1,
    }


def test_connected_to_dedicated_postgres_database(db):
    assert db.execute(text("SELECT current_database()" )).scalar_one() == TEST_DB_NAME
    assert db.execute(text("SELECT current_schema()" )).scalar_one().startswith("lms_it_")


def test_submission_and_attempt_are_persisted_in_postgres(db, records):
    db.commit()
    with Session(bind=db.get_bind(), join_transaction_mode="create_savepoint") as other_session:
        submission = other_session.get(Submission, records["submission"].id)
        attempt = other_session.get(SubmissionAttempt, records["attempt1"].id)
        assert submission.assignment_id == records["assignment"].id
        assert submission.student_id == records["student"].id
        assert attempt.submission_id == submission.id
        assert attempt.attempt_number == 1
        assert attempt.text_response == "Version one"


def test_multiple_attempt_numbers_are_persisted(db, records):
    second = _insert(
        db, SubmissionAttempt,
        submission_id=records["submission"].id,
        attempt_number=2,
        text_response="Version two",
    )
    db.commit()
    attempt_numbers = [
        a.attempt_number
        for a in db.query(SubmissionAttempt)
        .filter(SubmissionAttempt.submission_id == records["submission"].id)
        .order_by(SubmissionAttempt.attempt_number)
        .all()
    ]
    assert attempt_numbers == [1, 2]
    assert second.id != records["attempt1"].id


def test_unique_submission_per_student_and_assignment(db, records):
    duplicate = Submission(
        assignment_id=records["assignment"].id,
        student_id=records["student"].id,
        text_response="Should not be inserted",
    )
    db.add(duplicate)
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_duplicate_attempt_number_is_rejected_by_database(db, records):
    db.add(SubmissionAttempt(
        submission_id=records["submission"].id,
        attempt_number=1,
        text_response="Duplicate first attempt",
    ))
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_attempt_number_one_is_allowed_for_another_student(db, records):
    other_student = _insert(
        db, User,
        role=UserRole.STUDENT,
        email=f"another-{uuid.uuid4().hex}@example.test",
        full_name="Second Student",
        name="Second Student",
        password_hash="not-a-real-password-hash",
        hashed_password="not-a-real-password-hash",
    )
    other_submission = _insert(
        db, Submission,
        assignment_id=records["assignment"].id,
        student_id=other_student.id,
        text_response="Other student's answer",
    )
    other_attempt = _insert(
        db, SubmissionAttempt,
        submission_id=other_submission.id,
        attempt_number=1,
        text_response="Other student's first attempt",
    )
    assert other_attempt.id != records["attempt1"].id


def test_attempt_cannot_reference_nonexistent_submission(db, records):
    db.add(SubmissionAttempt(
        submission_id=2147483647,
        attempt_number=99,
        text_response="Orphan attempt",
    ))
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_feedback_is_independent_and_persists(db, records):
    second = _insert(
        db, SubmissionAttempt,
        submission_id=records["submission"].id,
        attempt_number=2,
        text_response="Version two",
    )
    first = records["attempt1"]
    first.feedback = "Improve the database schema"
    first.reviewed_by = records["professor"].id
    first.reviewed_at = datetime.now(timezone.utc)
    db.commit()

    with Session(bind=db.get_bind(), join_transaction_mode="create_savepoint") as other_session:
        first_from_db = other_session.get(SubmissionAttempt, first.id)
        second_from_db = other_session.get(SubmissionAttempt, second.id)
        assert first_from_db.feedback == "Improve the database schema"
        assert first_from_db.reviewed_by == records["professor"].id
        assert first_from_db.reviewed_at is not None
        assert second_from_db.feedback is None


def test_edit_latest_attempt_keeps_id_and_previous_feedback(db, records):
    first = records["attempt1"]
    first.feedback = "Your first review"
    second = _insert(
        db, SubmissionAttempt,
        submission_id=records["submission"].id,
        attempt_number=2,
        text_response="Version two",
    )
    db.commit()

    second.text_response = "Edited second attempt"
    db.commit()
    assert second.id != first.id
    assert second.attempt_number == 2
    assert first.feedback == "Your first review"
    assert db.query(SubmissionAttempt).filter(
        SubmissionAttempt.submission_id == records["submission"].id
    ).count() == 2


def test_final_grade_and_grader_are_persisted(db, records):
    sub = records["submission"]
    sub.score = Decimal("92.5")
    sub.feedback = "Final feedback"
    sub.graded_by = records["professor"].id
    sub.graded_at = datetime.now(timezone.utc)
    db.commit()

    with Session(bind=db.get_bind(), join_transaction_mode="create_savepoint") as other_session:
        saved = other_session.get(Submission, sub.id)
        assert saved.score == Decimal("92.5")
        assert saved.feedback == "Final feedback"
        assert saved.graded_by == records["professor"].id
        assert saved.graded_at is not None


def test_assignment_multiple_policy_is_saved(db, records):
    assignment_id = records["assignment"].id
    db.commit()
    with Session(bind=db.get_bind(), join_transaction_mode="create_savepoint") as other_session:
        assignment = other_session.get(Assignment, assignment_id)
        assert assignment.allow_multiple_submissions is True


def test_explicit_rollback_discards_uncommitted_attempt(db, records):
    submission_id = records["submission"].id
    db.commit()
    _insert(
        db, SubmissionAttempt,
        submission_id=submission_id,
        attempt_number=2,
        text_response="Rolled-back attempt",
    )
    db.rollback()
    with Session(bind=db.get_bind(), join_transaction_mode="create_savepoint") as other_session:
        numbers = [a.attempt_number for a in other_session.query(SubmissionAttempt)
                   .filter(SubmissionAttempt.submission_id == submission_id)
                   .order_by(SubmissionAttempt.attempt_number).all()]
        assert numbers == [1]
