"""Phase 11.9: isolated assignment-workflow tests (no database writes).

These exercise the actual endpoint functions from Phase 11.8C plus per-attempt
feedback. FakeDB replaces PostgreSQL; uploaded files use pytest's tmp_path.
Run from backend/: python -m pytest -q tests/test_assignment_workflow.py
"""

import asyncio
import io
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, UploadFile

from app.api import submissions as api
from app.api import submission_attempts as feedback_api
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.submission import Submission
from app.models.submission_attempt import SubmissionAttempt
from app.models.user import UserRole
from app.schemas.grading import GradeSubmission
from app.schemas.submission_attempt import AttemptFeedbackUpdate


STUDENT_ID = 11
PROFESSOR_ID = 21
OTHER_PROFESSOR_ID = 22
ASSIGNMENT_ID = 41
COURSE_ID = 51
SUBMISSION_ID = 61


def actor(user_id, role):
    return SimpleNamespace(id=user_id, role=role)


STUDENT = actor(STUDENT_ID, UserRole.STUDENT)
PROFESSOR = actor(PROFESSOR_ID, UserRole.PROFESSOR)
OTHER_PROFESSOR = actor(OTHER_PROFESSOR_ID, UserRole.PROFESSOR)


def future(minutes=30):
    return datetime.now(timezone.utc) + timedelta(minutes=minutes)


def past(minutes=30):
    return datetime.now(timezone.utc) - timedelta(minutes=minutes)


def make_assignment(*, multiple=False, due_at=None):
    return SimpleNamespace(
        id=ASSIGNMENT_ID,
        course_id=COURSE_ID,
        due_at=due_at if due_at is not None else future(),
        allow_multiple_submissions=multiple,
        max_score=Decimal('100'),
    )


def make_submission(*, owner=STUDENT_ID, text='Initial answer', filename=None):
    return Submission(
        id=SUBMISSION_ID,
        assignment_id=ASSIGNMENT_ID,
        student_id=owner,
        text_response=text,
        original_filename=filename,
        stored_filename=filename,
        submitted_at=past(10),
    )


def make_attempt(number=1, *, feedback=None, filename=None):
    return SubmissionAttempt(
        id=70 + number,
        submission_id=SUBMISSION_ID,
        attempt_number=number,
        text_response=f'Answer {number}',
        original_filename=filename,
        stored_filename=filename,
        submitted_at=past(10),
        feedback=feedback,
        reviewed_by=PROFESSOR_ID if feedback else None,
        reviewed_at=past(5) if feedback else None,
    )


class FakeQuery:
    """Small query stub for this one-course, one-student test fixture."""

    def __init__(self, db, model):
        self.db = db
        self.model = model

    def filter(self, *args, **kwargs):
        return self

    def with_for_update(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def first(self):
        if self.model is Submission:
            return self.db.submission
        if self.model is SubmissionAttempt:
            return max(self.db.attempts, key=lambda a: a.attempt_number, default=None)
        if self.model is Enrollment:
            return self.db.enrolled and SimpleNamespace(id=1) or None
        raise AssertionError(f'Unexpected query model: {self.model}')

    def all(self):
        if self.model is Submission:
            return [self.db.submission] if self.db.submission is not None else []
        if self.model is SubmissionAttempt:
            return sorted(self.db.attempts, key=lambda a: a.attempt_number)
        raise AssertionError(f'Unexpected query model: {self.model}')


class FakeDB:
    """No engine, database connection, or real records are involved."""

    def __init__(self, *, assignment=None, submission=None, attempts=None, enrolled=True):
        self.assignment = assignment if assignment is not None else make_assignment()
        self.course = SimpleNamespace(id=COURSE_ID, professor_id=PROFESSOR_ID)
        self.submission = submission
        self.attempts = list(attempts or [])
        self.enrolled = enrolled
        self.commit_count = 0

    def get(self, model, pk):
        if model is Assignment:
            return self.assignment if pk == ASSIGNMENT_ID else None
        if model is Course:
            return self.course if pk == COURSE_ID else None
        if model is Submission:
            return self.submission if self.submission is not None and pk == self.submission.id else None
        if model is SubmissionAttempt:
            return next((x for x in self.attempts if x.id == pk), None)
        raise AssertionError(f'Unexpected get model: {model}')

    def query(self, model):
        return FakeQuery(self, model)

    def add(self, obj):
        if isinstance(obj, Submission):
            if obj.id is None:
                obj.id = SUBMISSION_ID
            self.submission = obj
        elif isinstance(obj, SubmissionAttempt):
            if obj.id is None:
                obj.id = 70 + len(self.attempts) + 1
            self.attempts.append(obj)
        else:
            raise AssertionError(f'Unexpected added object: {type(obj)}')

    def flush(self):
        pass

    def commit(self):
        self.commit_count += 1

    def refresh(self, obj):
        pass

    def rollback(self):
        pass


def post(db, text='New answer', *, file=None, user=STUDENT):
    return asyncio.run(api.submit_assignment(
        assignment_id=ASSIGNMENT_ID,
        text_response=text,
        file=file,
        db=db,
        current_user=user,
    ))


def put(db, text='Edited answer', *, file=None, user=STUDENT):
    return asyncio.run(api.update_submission(
        submission_id=SUBMISSION_ID,
        text_response=text,
        file=file,
        db=db,
        current_user=user,
    ))


def assert_http_error(expected_status, call):
    with pytest.raises(HTTPException) as exc:
        call()
    assert exc.value.status_code == expected_status


def test_first_submission_creates_attempt_one():
    db = FakeDB()
    result = post(db)
    assert result.student_id == STUDENT_ID
    assert [(a.submission_id, a.attempt_number) for a in db.attempts] == [(SUBMISSION_ID, 1)]
    assert db.commit_count == 1


def test_single_policy_rejects_second_post():
    db = FakeDB(submission=make_submission(), attempts=[make_attempt()])
    assert_http_error(409, lambda: post(db))
    assert len(db.attempts) == 1


def test_single_policy_edit_updates_without_new_attempt():
    attempt = make_attempt()
    db = FakeDB(submission=make_submission(), attempts=[attempt])
    put(db, 'Revised single answer')
    assert len(db.attempts) == 1
    assert attempt.id == 71 and attempt.attempt_number == 1
    assert attempt.text_response == 'Revised single answer'


def test_multiple_policy_post_creates_new_attempt_without_losing_feedback():
    attempt1 = make_attempt(feedback='Improve your design.')
    db = FakeDB(
        assignment=make_assignment(multiple=True),
        submission=make_submission(),
        attempts=[attempt1],
    )
    post(db, 'Second answer')
    assert len(db.attempts) == 2
    assert [a.attempt_number for a in db.attempts] == [1, 2]
    assert db.attempts[0].feedback == 'Improve your design.'
    assert db.attempts[1].text_response == 'Second answer'
    assert db.attempts[1].feedback is None


def test_multiple_policy_edit_keeps_current_attempt_number_and_feedback():
    old = make_attempt(1, feedback='Comment on the earlier version', filename='old.pdf')
    latest = make_attempt(2, feedback='Review this version')
    db = FakeDB(
        assignment=make_assignment(multiple=True),
        submission=make_submission(text='Answer 2'),
        attempts=[old, latest],
    )
    put(db, 'Corrected second answer')
    assert len(db.attempts) == 2
    assert latest.id == 72 and latest.attempt_number == 2
    assert latest.text_response == 'Corrected second answer'
    assert old.feedback == 'Comment on the earlier version'
    assert old.stored_filename == 'old.pdf'
    # Current implementation preserves feedback after edit; re-review marker
    # is a separate enhancement, not assumed by this test.
    assert latest.feedback == 'Review this version'


def test_submit_after_deadline_is_rejected():
    db = FakeDB(assignment=make_assignment(multiple=True, due_at=past()))
    assert_http_error(409, lambda: post(db))
    assert db.commit_count == 0


def test_edit_after_deadline_is_rejected():
    db = FakeDB(
        assignment=make_assignment(due_at=past()),
        submission=make_submission(),
        attempts=[make_attempt()],
    )
    assert_http_error(409, lambda: put(db))
    assert db.commit_count == 0


def test_student_cannot_edit_someone_elses_submission():
    db = FakeDB(submission=make_submission(owner=999), attempts=[make_attempt()])
    assert_http_error(403, lambda: put(db))


def test_unenrolled_student_cannot_submit():
    db = FakeDB(enrolled=False)
    assert_http_error(403, lambda: post(db))


def test_professor_cannot_grade_before_deadline():
    db = FakeDB(submission=make_submission(), attempts=[make_attempt()])
    grade = GradeSubmission(score=Decimal('80'), feedback='Final feedback')
    assert_http_error(409, lambda: api.grade_submission(
        submission_id=SUBMISSION_ID, data=grade, db=db, current_user=PROFESSOR,
    ))


def test_professor_can_grade_latest_after_deadline():
    db = FakeDB(
        assignment=make_assignment(multiple=True, due_at=past()),
        submission=make_submission(text='Final attempt'),
        attempts=[make_attempt(1), make_attempt(2)],
    )
    grade = GradeSubmission(score=Decimal('90'), feedback='Final grade feedback')
    result = api.grade_submission(
        submission_id=SUBMISSION_ID, data=grade, db=db, current_user=PROFESSOR,
    )
    assert result.score == Decimal('90')
    assert result.feedback == 'Final grade feedback'
    assert result.graded_by == PROFESSOR_ID
    assert result.graded_at is not None
    assert all(not hasattr(attempt, 'score') or attempt.score is None for attempt in db.attempts)


def test_grade_above_maximum_is_rejected():
    db = FakeDB(
        assignment=make_assignment(due_at=past()),
        submission=make_submission(), attempts=[make_attempt()],
    )
    grade = GradeSubmission(score=Decimal('101'), feedback='Too high')
    assert_http_error(400, lambda: api.grade_submission(
        submission_id=SUBMISSION_ID, data=grade, db=db, current_user=PROFESSOR,
    ))


def test_other_course_professor_cannot_grade():
    db = FakeDB(
        assignment=make_assignment(due_at=past()),
        submission=make_submission(), attempts=[make_attempt()],
    )
    grade = GradeSubmission(score=Decimal('50'), feedback='Unauthorized')
    assert_http_error(403, lambda: api.grade_submission(
        submission_id=SUBMISSION_ID, data=grade, db=db, current_user=OTHER_PROFESSOR,
    ))


def test_professor_feedback_is_saved_to_only_selected_attempt():
    first, second = make_attempt(1), make_attempt(2)
    db = FakeDB(
        assignment=make_assignment(multiple=True),
        submission=make_submission(), attempts=[first, second],
    )
    data = AttemptFeedbackUpdate(feedback='Please improve attempt one.')
    feedback_api.update_attempt_feedback(
        attempt_id=first.id, data=data, db=db, current_user=PROFESSOR,
    )
    assert first.feedback == 'Please improve attempt one.'
    assert first.reviewed_by == PROFESSOR_ID
    assert first.reviewed_at is not None
    assert second.feedback is None


def test_student_cannot_write_professor_feedback():
    attempt = make_attempt()
    db = FakeDB(submission=make_submission(), attempts=[attempt])
    data = AttemptFeedbackUpdate(feedback='I am the professor')
    assert_http_error(403, lambda: feedback_api.update_attempt_feedback(
        attempt_id=attempt.id, data=data, db=db, current_user=STUDENT,
    ))


def test_professor_from_other_course_cannot_comment():
    attempt = make_attempt()
    db = FakeDB(submission=make_submission(), attempts=[attempt])
    data = AttemptFeedbackUpdate(feedback='Not my course')
    assert_http_error(403, lambda: feedback_api.update_attempt_feedback(
        attempt_id=attempt.id, data=data, db=db, current_user=OTHER_PROFESSOR,
    ))


def test_student_can_read_own_attempts_but_not_others():
    attempt = make_attempt(feedback='Needs improvement')
    db = FakeDB(submission=make_submission(), attempts=[attempt])
    own = feedback_api.list_submission_attempts(
        submission_id=SUBMISSION_ID, db=db, current_user=STUDENT,
    )
    assert len(own) == 1 and own[0].feedback == 'Needs improvement'
    stranger = actor(999, UserRole.STUDENT)
    assert_http_error(403, lambda: feedback_api.list_submission_attempts(
        submission_id=SUBMISSION_ID, db=db, current_user=stranger,
    ))


def test_uploaded_file_stays_in_temporary_directory(monkeypatch, tmp_path):
    monkeypatch.setattr(api, 'UPLOAD_DIR', tmp_path)
    db = FakeDB()
    upload = UploadFile(file=io.BytesIO(b'demo file contents'), filename='assignment.pdf')
    post(db, text=None, file=upload)
    assert db.submission.original_filename == 'assignment.pdf'
    assert db.attempts[0].stored_filename == db.submission.stored_filename
    assert (tmp_path / db.submission.stored_filename).read_bytes() == b'demo file contents'


def test_oversize_upload_is_removed(monkeypatch, tmp_path):
    monkeypatch.setattr(api, 'UPLOAD_DIR', tmp_path)
    monkeypatch.setattr(api, 'MAX_FILE_SIZE', 4)
    db = FakeDB()
    upload = UploadFile(file=io.BytesIO(b'12345'), filename='large.pdf')
    assert_http_error(413, lambda: post(db, text=None, file=upload))
    assert list(tmp_path.iterdir()) == []
    assert db.commit_count == 0


def test_disallowed_file_extension_is_rejected(monkeypatch, tmp_path):
    monkeypatch.setattr(api, 'UPLOAD_DIR', tmp_path)
    db = FakeDB()
    upload = UploadFile(file=io.BytesIO(b'x'), filename='dangerous.exe')
    assert_http_error(400, lambda: post(db, text=None, file=upload))
    assert list(tmp_path.iterdir()) == []
