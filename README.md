# University LMS

A full-stack **University Learning Management System** for course delivery, assignment management, online classrooms, attendance, feedback, and grading. The application supports three roles—**administrator, professor, and student**—with server-enforced access checks.

**Project status:** Implemented and tested through **Phase 12.5 (full-stack end-to-end testing)**. Production security and deployment review is planned for Phase 12.6; this repository should not yet be treated as a production-ready service.

## What it does

- **Accounts and courses:** student registration and login, administrator-managed users and courses, professor assignments, course enrollment.
- **Learning resources:** upload, browse, download, and remove course materials with course-level access rules.
- **Assignments:** single- or multiple-submission policy, deadlines, text/file submissions, editing the active attempt, chronological attempt history.
- **Assessment:** professor feedback per attempt; final score/feedback after the deadline; student submission status and role-specific dashboards.
- **Classrooms:** scheduled Jitsi-based meetings, meeting links, manually managed attendance, session tracking and automated attendance reports.
- **Notifications:** student-facing in-app updates for attempt feedback and final grades, unread counts and read acknowledgements.

## Technology

| Layer | Implementation |
|---|---|
| Frontend | React, TypeScript, Vite |
| API | Python, FastAPI, Pydantic |
| Persistence | PostgreSQL, SQLAlchemy, Alembic migrations |
| Authentication | Argon2 password hashes; bearer JWTs |
| Local infrastructure | Docker Compose (PostgreSQL, Redis) |
| Online meetings | Jitsi React SDK / meet.jit.si |
| Tests | pytest, Vitest + React Testing Library, Playwright |
| Continuous integration | GitHub Actions: backend/frontend, mocked-browser, full-stack E2E |

> Redis is provisioned by the local Compose file; this documentation does not assume a particular production caching or queue workflow. Course/material/submission data is stored by PostgreSQL; uploaded file bytes are stored under backend `uploads/` directories.

## Quick start (Windows / Git Bash)

Prerequisites: Python, Node.js/npm, Docker Desktop, Git. Use the versions in the repository's GitHub Actions workflows as a tested CI reference (Python 3.13 and Node.js 22); ensure your local versions are compatible.

**1. Start infrastructure** from the repository root:

```bash
docker compose -f infrastructure/docker-compose.yml up -d --wait
```

**2. Start the API** in terminal 1:

```bash
cd backend
python -m venv venv                # first time only
source venv/Scripts/activate       # Git Bash on Windows
python -m pip install -r requirements.txt  # first time / after dependency updates
python -m uvicorn app.main:app --reload
```

API: `http://127.0.0.1:8000` · Health: `http://127.0.0.1:8000/health` · Swagger: `http://127.0.0.1:8000/docs`.

**3. Start the web UI** in terminal 2:

```bash
cd frontend
npm ci                           # first time / after dependency updates
npm run dev
```

UI: `http://localhost:5173`. The Vite development proxy forwards `/api` requests to FastAPI on port 8000.

> **Database setup:** An existing development database may already be initialized. For a fresh checkout, check `backend/alembic.ini` before running `python -m alembic upgrade head`: Alembic currently reads the URL in that file, independently of the application's `DATABASE_URL` setting. Review [Technical Commands](docs/05-TECHNICAL-COMMANDS.md) before applying migrations. Do not run the E2E seed script against the development database.

## Run tests

```bash
# Backend (from backend/, with venv activated)
python -m pytest -v tests/test_assignment_workflow.py tests/test_assignment_http_api.py tests/test_postgres_submission_integrity.py tests/test_notifications.py

# Frontend (from frontend/)
npx vitest run --config vitest.config.ts
npm run build

# Mocked API browser tests (from frontend/)
npx playwright test --config playwright.config.ts
```

The PostgreSQL integration suite expects a separate test database. The **real full-stack** Playwright tests use a disposable PostgreSQL instance, separate ports, and a resettable seed. Follow the dedicated procedure in [Technical Commands](docs/05-TECHNICAL-COMMANDS.md#full-stack-e2e-with-real-postgresql) instead of running them against your normal database.

## Documentation

| Document | Purpose |
|---|---|
| [System documentation](docs/01-SYSTEM-DOCUMENTATION.md) | Scope, architecture, users, workflows, rules and limitations |
| [Database model and ER diagram](docs/02-DATABASE-MODEL-AND-ERD.md) | Eleven modeled tables, relationships, keys, constraints, Mermaid ERD |
| [Test cases and test evidence](docs/03-TEST-CASES-AND-QUALITY.md) | Strategy, test inventory, expected results, coverage and gaps |
| [API interface reference](docs/04-API-INTERFACE.md) | Routes, methods, access rules, examples, error responses |
| [Technical command runbook](docs/05-TECHNICAL-COMMANDS.md) | Start, debug, migrate, inspect, test, stop, CI and troubleshooting |
| [Repository structure](docs/06-PROJECT-STRUCTURE.md) | Directory tree and responsibilities |
| [Project history and traceability](docs/07-PROJECT-HISTORY.md) | Development milestones through 12.5, verification, future backlog |

The FastAPI application also publishes a generated, executable API specification at `/openapi.json` and interactive API documentation at `/docs`. Treat these, plus SQLAlchemy models and Alembic migrations, as the implementation source of truth if this narrative documentation becomes outdated.

## Quality and security notes

The project has demonstrated local and GitHub Actions test passes through Phase 12.5. Tests cover defined scenarios, not all possible defects. **Before external deployment**, audit credentials, environment variable defaults, upload storage, transport security, error handling, backup/recovery, dependency versions, and deployment settings. Never commit real `.env` files, personal user data, production credentials, or uploaded submissions.

## Repository

[University-LMS on GitHub](https://github.com/micomiki/University-LMS) · Documentation baseline: **2026-11-08** · Version label: **Phase 12.5**.

