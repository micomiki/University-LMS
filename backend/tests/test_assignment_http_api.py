"""Stage 2A: HTTP-level integration tests with the real FastAPI app.

These use TestClient and dependency overrides. They exercise routing,
request parsing, Pydantic response serialization, and role checks.
The database layer is intentionally replaced with the Stage 1 FakeDB.

Run from backend/: python -m pytest -v tests/test_assignment_http_api.py
"""

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.dependencies import get_current_user
from app.api import submissions as submissions_api
from app.db.session import get_db
from app.models.submission import Submission
from app.models.submission_attempt import SubmissionAttempt
from app.models.user import UserRole

# Reuse proven, database-free fixtures from Stage 1.
from test_assignment_workflow import (
    FakeDB,
    STUDENT,
    PROFESSOR,
    OTHER_PROFESSOR,
    ASSIGNMENT_ID,
    SUBMISSION_ID,
    make_assignment,
    make_submission,
    make_attempt,
    past,
)


def utc_now():
    return datetime.now(timezone.utc)


class HTTPFakeDB(FakeDB):
    """Emulate server-generated defaults needed by response serialization."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.submission is not None:
            self._add_defaults(self.submission)
        for attempt in self.attempts:
            self._add_defaults(attempt)

    @staticmethod
    def _add_defaults(obj):
        if getattr(obj, "submitted_at", None) is None:
            obj.submitted_at = utc_now()
        if isinstance(obj, Submission):
            if getattr(obj, "updated_at", None) is None:
                obj.updated_at = utc_now()
            if hasattr(Submission, "is_withdrawn") and getattr(obj, "is_withdrawn", None) is None:
                obj.is_withdrawn = False
        if isinstance(obj, SubmissionAttempt):
            # A new attempt starts without feedback or a reviewer.
            if getattr(obj, "feedback", None) is None:
                obj.feedback = None
            if getattr(obj, "reviewed_by", None) is None:
                obj.reviewed_by = None
            if getattr(obj, "reviewed_at", None) is None:
                obj.reviewed_at = None

    def add(self, obj):
        self._add_defaults(obj)
        super().add(obj)

    def refresh(self, obj):
        self._add_defaults(obj)


@pytest.fixture
def client_as():
    """Supply an isolated fake session and a selected signed-in user."""
    original_overrides = app.dependency_overrides.copy()

    def make_client(db=None, actor=STUDENT):
        database = db if db is not None else HTTPFakeDB()

        def override_db():
            yield database

        def override_user():
            return actor

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = override_user
        return TestClient(app), database

    yield make_client
    app.dependency_overrides.clear()
    app.dependency_overrides.update(original_overrides)


def _db(*, multiple=False, before_deadline=True, submission=None, attempts=None):
    return HTTPFakeDB(
        assignment=make_assignment(
            multiple=multiple,
            due_at=None if before_deadline else past(),
        ),
        submission=submission,
        attempts=attempts,
    )


def test_openapi_lists_the_submission_and_feedback_routes():
    # This verifies that the routers are registered in the real FastAPI app.
    with TestClient(app) as client:
        response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert f"/api/submissions/assignments/{{assignment_id}}" in paths
    assert "/api/submission-attempts/{attempt_id}/feedback" in paths


def test_unauthenticated_submission_request_is_rejected():
    original = app.dependency_overrides.copy()
    try:
        app.dependency_overrides.pop(get_current_user, None)
        response = TestClient(app).get("/api/submissions/my-submissions")
        assert response.status_code in (401, 403)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(original)


def test_http_post_creates_first_submission_and_attempt(client_as):
    client, db = client_as()
    response = client.post(
        f"/api/submissions/assignments/{ASSIGNMENT_ID}",
        data={"text_response": "First HTTP submission"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["assignment_id"] == ASSIGNMENT_ID
    assert len(db.attempts) == 1
    assert db.attempts[0].attempt_number == 1


def test_http_single_policy_rejects_second_post(client_as):
    db = _db(submission=make_submission(), attempts=[make_attempt()])
    client, _ = client_as(db)
    response = client.post(
        f"/api/submissions/assignments/{ASSIGNMENT_ID}",
        data={"text_response": "Duplicate"},
    )
    assert response.status_code == 409, response.text
    assert len(db.attempts) == 1


def test_http_multiple_policy_adds_attempt_and_preserves_comment(client_as):
    first = make_attempt(feedback="Improve the first version")
    db = _db(multiple=True, submission=make_submission(), attempts=[first])
    client, _ = client_as(db)
    response = client.post(
        f"/api/submissions/assignments/{ASSIGNMENT_ID}",
        data={"text_response": "Second HTTP version"},
    )
    assert response.status_code == 201, response.text
    assert [a.attempt_number for a in db.attempts] == [1, 2]
    assert first.feedback == "Improve the first version"
    assert db.attempts[1].text_response == "Second HTTP version"


def test_http_put_edits_current_attempt_without_creating_another(client_as):
    old, current = make_attempt(1), make_attempt(2)
    db = _db(multiple=True, submission=make_submission(), attempts=[old, current])
    client, _ = client_as(db)
    response = client.put(
        f"/api/submissions/{SUBMISSION_ID}",
        data={"text_response": "Corrected latest attempt"},
    )
    assert response.status_code == 200, response.text
    assert len(db.attempts) == 2
    assert current.attempt_number == 2
    assert current.text_response == "Corrected latest attempt"


def test_http_empty_first_submission_is_rejected(client_as):
    client, db = client_as()
    response = client.post(f"/api/submissions/assignments/{ASSIGNMENT_ID}")
    assert response.status_code == 400, response.text
    assert len(db.attempts) == 0


def test_http_post_after_deadline_is_rejected(client_as):
    client, db = client_as(_db(multiple=True, before_deadline=False))
    response = client.post(
        f"/api/submissions/assignments/{ASSIGNMENT_ID}",
        data={"text_response": "Late work"},
    )
    assert response.status_code == 409, response.text
    assert not db.attempts


def test_http_edit_after_deadline_is_rejected(client_as):
    db = _db(before_deadline=False, submission=make_submission(), attempts=[make_attempt()])
    client, _ = client_as(db)
    response = client.put(
        f"/api/submissions/{SUBMISSION_ID}",
        data={"text_response": "Late edit"},
    )
    assert response.status_code == 409, response.text


def test_http_student_cannot_edit_someone_elses_submission(client_as):
    db = _db(submission=make_submission(owner=999), attempts=[make_attempt()])
    client, _ = client_as(db)
    response = client.put(
        f"/api/submissions/{SUBMISSION_ID}",
        data={"text_response": "Not mine"},
    )
    assert response.status_code == 403, response.text


def test_http_professor_comments_on_only_one_attempt(client_as):
    first, second = make_attempt(1), make_attempt(2)
    db = _db(multiple=True, submission=make_submission(), attempts=[first, second])
    client, _ = client_as(db, PROFESSOR)
    response = client.put(
        f"/api/submission-attempts/{first.id}/feedback",
        json={"feedback": "Please revise this version."},
    )
    assert response.status_code == 200, response.text
    assert response.json()["feedback"] == "Please revise this version."
    assert first.feedback == "Please revise this version."
    assert second.feedback is None


def test_http_student_cannot_write_professor_feedback(client_as):
    db = _db(submission=make_submission(), attempts=[make_attempt()])
    client, _ = client_as(db, STUDENT)
    response = client.put(
        "/api/submission-attempts/71/feedback",
        json={"feedback": "Pretending to be a professor"},
    )
    assert response.status_code == 403, response.text


def test_http_professor_from_other_course_cannot_comment(client_as):
    db = _db(submission=make_submission(), attempts=[make_attempt()])
    client, _ = client_as(db, OTHER_PROFESSOR)
    response = client.put(
        "/api/submission-attempts/71/feedback",
        json={"feedback": "Unauthorized comment"},
    )
    assert response.status_code == 403, response.text


def test_http_student_can_read_their_attempt_feedback(client_as):
    db = _db(submission=make_submission(), attempts=[make_attempt(feedback="Fix naming")])
    client, _ = client_as(db, STUDENT)
    response = client.get(f"/api/submission-attempts/submissions/{SUBMISSION_ID}")
    assert response.status_code == 200, response.text
    assert len(response.json()) == 1
    assert response.json()[0]["feedback"] == "Fix naming"


def test_http_professor_cannot_grade_before_deadline(client_as):
    db = _db(submission=make_submission(), attempts=[make_attempt()])
    client, _ = client_as(db, PROFESSOR)
    response = client.put(
        f"/api/submissions/{SUBMISSION_ID}/grade",
        json={"score": 80, "feedback": "Good work"},
    )
    assert response.status_code == 409, response.text


def test_http_professor_can_grade_after_deadline(client_as):
    db = _db(
        multiple=True,
        before_deadline=False,
        submission=make_submission(),
        attempts=[make_attempt(1), make_attempt(2)],
    )
    client, _ = client_as(db, PROFESSOR)
    response = client.put(
        f"/api/submissions/{SUBMISSION_ID}/grade",
        json={"score": 90, "feedback": "Final assessment"},
    )
    assert response.status_code == 200, response.text
    assert Decimal(str(response.json()["score"])) == Decimal("90")
    assert db.submission.graded_by == PROFESSOR.id


def test_http_invalid_grade_data_is_rejected(client_as):
    db = _db(before_deadline=False, submission=make_submission(), attempts=[make_attempt()])
    client, _ = client_as(db, PROFESSOR)
    response = client.put(
        f"/api/submissions/{SUBMISSION_ID}/grade",
        json={"score": "not a number", "feedback": "Bad data"},
    )
    assert response.status_code == 422, response.text


def test_http_invalid_file_type_is_rejected_without_uploading(client_as, monkeypatch, tmp_path):
    monkeypatch.setattr(submissions_api, "UPLOAD_DIR", tmp_path)
    client, db = client_as()
    response = client.post(
        f"/api/submissions/assignments/{ASSIGNMENT_ID}",
        data={"text_response": "Attached"},
        files={"file": ("bad.exe", b"abc", "application/octet-stream")},
    )
    assert response.status_code == 400, response.text
    assert list(tmp_path.iterdir()) == []
    assert db.submission is None
