"""Phase 12.3: HTTP authorization, unread counts, and notification persistence.

Uses SQLite in memory. Does not touch university_lms or university_lms_test.
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.dependencies import get_current_user
from app.db.session import Base, get_db
import app.models  # Registers all application SQLAlchemy models
from app.main import app
from app.models.notification import Notification
from app.models.user import User, UserRole



@pytest.fixture
def harness():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)

    SessionTest = sessionmaker(
        bind=engine,
        expire_on_commit=False,
    )

    # Create test users and notifications
    with SessionTest() as db:

        # Step 1: Create students
        db.add_all([
            User(
                id=101,
                full_name="Student One",
                email="one@example.org",
                hashed_password="x",
                role=UserRole.STUDENT,
            ),
            User(
                id=102,
                full_name="Student Two",
                email="two@example.org",
                hashed_password="x",
                role=UserRole.STUDENT,
            ),
        ])

        # Ensure students exist before notifications
        db.flush()

        # Step 2: Create notifications
        db.add_all([
            Notification(
                id=201,
                recipient_id=101,
                event_type="attempt_feedback",
                title="Feedback",
                message="Review available.",
            ),
            Notification(
                id=202,
                recipient_id=102,
                event_type="final_grade",
                title="Grade",
                message="Grade available.",
            ),
            Notification(
                id=203,
                recipient_id=101,
                event_type="final_grade",
                title="Grade",
                message="Grade available.",
            ),
        ])

        db.commit()

    # Simulate the currently authenticated student
    actor = SimpleNamespace(id=101)

    def override_db():
        with SessionTest() as db:
            yield db

    def override_user():
        return actor

    # Override FastAPI dependencies during tests
    previous_overrides = app.dependency_overrides.copy()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user

    try:
        with TestClient(app) as client:
            yield client, SessionTest, actor

    finally:
        # Restore original dependencies
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)

        # Release the test database
        engine.dispose()



def test_list_shows_only_authenticated_users_notifications(harness):
    client, _, _ = harness
    response = client.get("/api/notifications/")
    assert response.status_code == 200
    assert {item["id"] for item in response.json()} == {201, 203}


def test_unread_count_and_mark_read(harness):
    client, _, _ = harness
    assert client.get("/api/notifications/unread-count").json() == {"unread_count": 2}
    response = client.patch("/api/notifications/201/read")
    assert response.status_code == 200
    assert response.json()["read_at"] is not None
    assert client.get("/api/notifications/unread-count").json() == {"unread_count": 1}


def test_cannot_mark_someone_elses_notification(harness):
    client, SessionTest, _ = harness
    response = client.patch("/api/notifications/202/read")
    assert response.status_code == 404
    with SessionTest() as db:
        assert db.get(Notification, 202).read_at is None


def test_mark_all_does_not_change_other_users_notifications(harness):
    client, SessionTest, _ = harness
    response = client.patch("/api/notifications/read-all")
    assert response.status_code == 200
    assert response.json() == {"unread_count": 0}
    with SessionTest() as db:
        assert db.get(Notification, 201).read_at is not None
        assert db.get(Notification, 203).read_at is not None
        assert db.get(Notification, 202).read_at is None


def test_changing_actor_restricts_mailbox(harness):
    client, _, actor = harness
    actor.id = 102
    response = client.get("/api/notifications/")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [202]
