import type { Page } from '@playwright/test'

type Role = 'STUDENT' | 'PROFESSOR'

type Assignment = {
  id: number
  course_id: number
  title: string
  description: string | null
  instructions: string | null
  due_at: string
  max_score: number
  allow_multiple_submissions: boolean
  created_at: string
}

type Submission = {
  id: number
  assignment_id: number
  student_id: number
  text_response: string | null
  original_filename: string | null
  submitted_at: string
  updated_at: string | null
  score: number | null
  feedback: string | null
  graded_at: string | null
}

type Attempt = {
  id: number
  submission_id: number
  attempt_number: number
  text_response: string | null
  original_filename: string | null
  submitted_at: string
  feedback: string | null
  reviewed_by: number | null
  reviewed_at: string | null
}

const date = '2026-11-08T12:00:00Z'

function multipartText(body: string | null): string {
  if (!body) return ''
  const match = body.match(/name="text_response"\r?\n\r?\n([\s\S]*?)\r?\n--/)
  return match?.[1]?.trim() ?? ''
}

export async function mockLms(
  page: Page,
  options: { role: Role; seededSubmission?: boolean; deadlinePast?: boolean },
) {
  const { role, seededSubmission = role === 'PROFESSOR', deadlinePast = false } = options
  const assignments: Assignment[] = [{
    id: 11,
    course_id: 1,
    title: 'E2E Essay',
    description: 'Write a short essay.',
    instructions: 'Explain your approach.',
    due_at: deadlinePast ? '2020-01-01T12:00:00Z' : '2099-01-01T12:00:00Z',
    max_score: 100,
    allow_multiple_submissions: true,
    created_at: date,
  }]
  const submissions: Submission[] = seededSubmission ? [{
    id: 50,
    assignment_id: 11,
    student_id: 7,
    text_response: 'Revised solution',
    original_filename: null,
    submitted_at: date,
    updated_at: null,
    score: null,
    feedback: null,
    graded_at: null,
  }] : []
  const attempts: Attempt[] = seededSubmission ? [
    { id: 301, submission_id: 50, attempt_number: 1, text_response: 'Initial solution', original_filename: null, submitted_at: date, feedback: 'Add more detail.', reviewed_by: 9, reviewed_at: date },
    { id: 302, submission_id: 50, attempt_number: 2, text_response: 'Revised solution', original_filename: null, submitted_at: date, feedback: null, reviewed_by: null, reviewed_at: null },
  ] : []

  let unread = true
  const notification = {
    id: 5,
    event_type: 'attempt_feedback',
    title: 'New feedback on your submission',
    message: 'Your professor reviewed Attempt 1.',
    course_id: 1,
    assignment_id: 11,
    attempt_id: 301,
    created_at: date,
    read_at: null as string | null,
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    const method = request.method()
    const json = (value: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(value),
    })

    if (pathname === '/api/auth/login' && method === 'POST') {
      if (request.postData()?.includes('password=wrong')) {
        await json({ detail: 'Incorrect username or password' }, 401)
      } else {
        await json({ access_token: 'e2e-fake-token', token_type: 'bearer' })
      }
      return
    }
    if (pathname === '/api/auth/me') {
      await json({ id: role === 'STUDENT' ? 7 : 9, full_name: role === 'STUDENT' ? 'Test Student' : 'Test Professor', role })
      return
    }
    if (pathname === '/api/courses/') {
      await json([{ id: 1, title: 'Software Engineering', course_code: 'SWE101', description: 'Software engineering course' }])
      return
    }
    if (pathname === '/api/enrollments/') {
      await json([{ id: 81, course_id: 1, student_id: 7 }])
      return
    }
    if (pathname === '/api/meetings/courses/1') {
      await json([])
      return
    }
    if (pathname === '/api/assignments/courses/1') {
      if (method === 'POST') {
        const data = request.postDataJSON() as Partial<Assignment>
        const newAssignment: Assignment = {
          id: assignments.length + 11,
          course_id: 1,
          title: data.title ?? 'New assignment',
          description: data.description ?? null,
          instructions: data.instructions ?? null,
          due_at: data.due_at ?? '2099-01-01T12:00:00Z',
          max_score: data.max_score ?? 100,
          allow_multiple_submissions: data.allow_multiple_submissions ?? false,
          created_at: date,
        }
        assignments.push(newAssignment)
        await json(newAssignment, 201)
      } else {
        await json(assignments)
      }
      return
    }
    if (pathname === '/api/submissions/my-submissions') {
      await json(submissions)
      return
    }
    if (pathname === '/api/submissions/assignments/11') {
      if (method === 'POST') {
        const responseText = multipartText(request.postData())
        if (submissions.length === 0) {
          submissions.push({ id: 50, assignment_id: 11, student_id: 7, text_response: responseText, original_filename: null, submitted_at: date, updated_at: null, score: null, feedback: null, graded_at: null })
        } else {
          submissions[0].text_response = responseText
          submissions[0].updated_at = date
        }
        attempts.push({ id: 300 + attempts.length + 1, submission_id: 50, attempt_number: attempts.length + 1, text_response: responseText, original_filename: null, submitted_at: date, feedback: null, reviewed_by: null, reviewed_at: null })
        await json(submissions[0], 201)
      } else {
        await json(submissions)
      }
      return
    }
    if (pathname === '/api/submissions/50' && method === 'PUT') {
      const responseText = multipartText(request.postData())
      submissions[0].text_response = responseText
      submissions[0].updated_at = date
      if (attempts.length > 0) attempts[attempts.length - 1].text_response = responseText
      await json(submissions[0])
      return
    }
    if (pathname === '/api/submissions/50' && method === 'GET') {
      await json(submissions[0])
      return
    }
    if (pathname === '/api/submission-attempts/submissions/50') {
      await json(attempts)
      return
    }
    const feedbackMatch = pathname.match(/^\/api\/submission-attempts\/(\d+)\/feedback$/)
    if (feedbackMatch && method === 'PUT') {
      const attempt = attempts.find((item) => item.id === Number(feedbackMatch[1]))
      if (!attempt) { await json({ detail: 'Not found' }, 404); return }
      const body = request.postDataJSON() as { feedback: string }
      attempt.feedback = body.feedback
      attempt.reviewed_by = 9
      attempt.reviewed_at = date
      await json(attempt)
      return
    }
    if (pathname === '/api/submissions/50/grade' && method === 'PUT') {
      const data = request.postDataJSON() as { score: number; feedback: string | null }
      submissions[0].score = data.score
      submissions[0].feedback = data.feedback
      submissions[0].graded_at = date
      await json(submissions[0])
      return
    }
    if (pathname === '/api/notifications/unread-count') {
      await json({ unread_count: unread ? 1 : 0 })
      return
    }
    if (pathname === '/api/notifications/' && method === 'GET') {
      await json([{ ...notification, read_at: unread ? null : date }])
      return
    }
    if (pathname === '/api/notifications/5/read' && method === 'PATCH') {
      unread = false
      await json({ ...notification, read_at: date })
      return
    }
    if (pathname === '/api/notifications/read-all' && method === 'PATCH') {
      unread = false
      await json({ unread_count: 0 })
      return
    }
    // Unexpected requests deliberately fail rather than silently returning fabricated data.
    await json({ detail: `No E2E mock for ${method} ${pathname}` }, 404)
  })

  return {
    assignments,
    submissions,
    attempts,
    getUnread: () => unread,
  }
}

export async function signIn(page: Page, role: Role) {
  await page.goto('/')
  await page.getByLabel('Email').fill(role === 'STUDENT' ? 'student@example.test' : 'professor@example.test')
  await page.getByLabel('Password').fill('demo-password')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.getByRole('heading', { name: `Welcome, ${role === 'STUDENT' ? 'Test Student' : 'Test Professor'}` }).waitFor()
}

export async function openCourseAssignments(page: Page, role: Role) {
  const menu = page.getByRole('navigation', { name: 'Main navigation' })
  await menu.getByRole('button', { name: role === 'STUDENT' ? 'Courses' : 'Teaching Courses', exact: true }).click()
  await page.getByRole('button', { name: 'Open Course' }).click()
  await page.getByRole('navigation', { name: 'Course navigation' }).getByRole('button', { name: 'Assignments' }).click()
  await page.getByRole('heading', { name: 'Course Assignments' }).waitFor()
}
