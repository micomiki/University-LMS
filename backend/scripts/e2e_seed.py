"""Reset and seed ONLY the disposable, locally bound university_lms_e2e database.

Run from backend/ with DATABASE_URL pointing at 127.0.0.1:55433/university_lms_e2e.
WARNING: this resets all tables/data in that designated test database.
"""

import os
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

# Allow `python scripts/e2e_seed.py` from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from sqlalchemy.engine import make_url

DB_URL = os.environ.get('DATABASE_URL', '')
url = make_url(DB_URL) if DB_URL else None
if not url or not (
    url.drivername == 'postgresql+psycopg'
    and url.host in ('127.0.0.1', 'localhost')
    and url.port == 55433
    and url.database == 'university_lms_e2e'
    and url.username == 'lms_e2e'
):
    raise SystemExit(
        'Refusing to seed: DATABASE_URL must point to the local E2E database '
        'lms_e2e@127.0.0.1:55433/university_lms_e2e.'
    )

# Imports intentionally come AFTER the URL guard.
import app.models  # noqa: E402
from app.models.notification import Notification  # noqa: F401,E402, ensures registration
from app.core.security import hash_password  # noqa: E402
from app.db.session import Base, engine, SessionLocal  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.models.course import Course  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.assignment import Assignment  # noqa: E402
from app.models.submission import Submission  # noqa: E402
from app.models.submission_attempt import SubmissionAttempt  # noqa: E402

with engine.begin() as connection:
    identity = connection.execute(
        text('SELECT current_database(), current_user')
    ).one()
    if identity[0] != 'university_lms_e2e' or identity[1] != 'lms_e2e':
        raise SystemExit('Connected database identity mismatch. No tables were reset.')

    # Destructive, intentionally scoped to the disposable E2E database.
    connection.execute(text('DROP SCHEMA public CASCADE'))
    connection.execute(text('CREATE SCHEMA public'))

Base.metadata.create_all(bind=engine)
now = datetime.now(timezone.utc)
password_hash = hash_password('E2ETest123!')

with SessionLocal() as db:
    
    professor = User(
      full_name='E2E Professor',
      email='professor.e2e@example.org',
      hashed_password=password_hash,
      role=UserRole.PROFESSOR,
      is_active=True,
    )

    student = User(
       full_name='E2E Student',
       email='student.e2e@example.org',
       hashed_password=password_hash,
       role=UserRole.STUDENT,
       is_active=True,
    )

    outsider = User(
       full_name='E2E Unenrolled Student',
       email='outsider.e2e@example.org',
       hashed_password=password_hash,
       role=UserRole.STUDENT,
       is_active=True,
    )


    
    
    db.add_all([professor, student, outsider])
    db.flush()

    course = Course(
        title='E2E Software Testing', course_code='E2E101',
        description='Isolated full-stack testing course', professor_id=professor.id,
    )
    db.add(course)
    db.flush()
    db.add(Enrollment(student_id=student.id, course_id=course.id))

    multiple = Assignment(
        title='E2E Multiple Attempts', description='Test attempt workflow',
        instructions='Submit and revise your solution',
        due_at=now + timedelta(days=4), max_score=Decimal('100'),
        course_id=course.id, created_by=professor.id,
        allow_multiple_submissions=True,
    )
    closed = Assignment(
        title='E2E Final Grading', description='Ready for grading',
        instructions='Grade after deadline',
        due_at=now - timedelta(days=1), max_score=Decimal('100'),
        course_id=course.id, created_by=professor.id,
        allow_multiple_submissions=False,
    )
    single = Assignment(
        title='E2E Single Submission', description='Single policy',
        instructions='Only one active submission',
        due_at=now + timedelta(days=4), max_score=Decimal('100'),
        course_id=course.id, created_by=professor.id,
        allow_multiple_submissions=False,
    )
    db.add_all([multiple, closed, single])
    db.flush()

    submission = Submission(
        assignment_id=closed.id, student_id=student.id,
        text_response='Finished work submitted before deadline.',
        submitted_at=now - timedelta(days=2),
    )
    db.add(submission)
    db.flush()
    db.add(SubmissionAttempt(
        submission_id=submission.id, attempt_number=1,
        text_response=submission.text_response,
        submitted_at=now - timedelta(days=2),
    ))
    db.commit()

print('E2E database reset and seeded. Only university_lms_e2e was modified.')
print('Student:   student.e2e@example.org')
print('Professor: professor.e2e@example.org')
print('Outsider:  outsider.e2e@example.org')
print('Test password: E2ETest123!')
print('Assignments: E2E Multiple Attempts, E2E Final Grading, E2E Single Submission')
