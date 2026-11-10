import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

// The tests below DO NOT intercept or mock API requests.
// The whole React -> FastAPI -> PostgreSQL flow is exercised.
const API = 'http://127.0.0.1:18000'
const PASSWORD = 'E2ETest123!'
const EMAIL = {
  student: 'student.e2e@example.org',
  professor: 'professor.e2e@example.org',
  outsider: 'outsider.e2e@example.org',
}

async function signIn(page: Page, role: keyof typeof EMAIL) {
  await page.goto('/')
  await page.getByLabel('Email').fill(EMAIL[role])
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: new RegExp('Welcome, E2E') })).toBeVisible()
}

async function openAssignments(page: Page, professor = false) {
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  await navigation.getByRole('button', {
    name: professor ? 'Teaching Courses' : 'Courses', exact: true,
  }).click()
  const courseCard = page.locator('.course-card').filter({
    has: page.getByRole('heading', { name: 'E2E Software Testing' }),
  })
  await courseCard.getByRole('button', { name: 'Open Course' }).click()
  await page.getByRole('navigation', { name: 'Course navigation' })
    .getByRole('button', { name: 'Assignments' }).click()
  await expect(page.getByRole('heading', { name: 'Course Assignments' })).toBeVisible()
}

async function assignmentCard(page: Page, title: string) {
  const card = page.locator('.assignment-card').filter({
    has: page.getByRole('heading', { name: title, exact: true }),
  })
  await expect(card).toBeVisible()
  // Assignment details are collapsed by default in the new UI.
  await card.getByRole('button', { name: 'View details' }).click()
  await expect(card.getByRole('button', { name: 'Hide details' })).toBeVisible()
  return card
}

async function token(request: APIRequestContext, role: keyof typeof EMAIL) {
  const login = await request.post(`${API}/api/auth/login`, {
    form: { username: EMAIL[role], password: PASSWORD },
  })
  expect(login.ok()).toBeTruthy()
  return (await login.json() as { access_token: string }).access_token
}

async function assignmentId(request: APIRequestContext, title: string) {
  const access = await token(request, 'student')
  const courses = await request.get(`${API}/api/courses/`, {
    headers: { Authorization: `Bearer ${access}` },
  })
  expect(courses.ok()).toBeTruthy()
  const course = (await courses.json() as Array<{ id: number; course_code: string }>)
    .find(c => c.course_code === 'E2E101')
  expect(course).toBeDefined()
  const assignments = await request.get(`${API}/api/assignments/courses/${course!.id}`, {
    headers: { Authorization: `Bearer ${access}` },
  })
  expect(assignments.ok()).toBeTruthy()
  const target = (await assignments.json() as Array<{ id: number; title: string }>)
    .find(a => a.title === title)
  expect(target).toBeDefined()
  return target!.id
}

test('student submits, edits current, adds attempt; professor comments; student sees feedback', async ({ page, request }) => {
  await signIn(page, 'student')
  await openAssignments(page)
  const card = await assignmentCard(page, 'E2E Multiple Attempts')
  const form = card.locator('.submission-form')

  await form.getByRole('button', { name: 'Submit Assignment' }).click()
  await form.getByLabel('Written Response').fill('First full-stack solution')
  await form.getByRole('button', { name: 'Submit Assignment' }).click()
  await expect(form.getByRole('button', { name: 'Edit Submission' })).toBeVisible()

  await form.getByRole('button', { name: 'Edit Submission' }).click()
  await form.getByLabel('Written Response').fill('Edited first full-stack solution')
  await form.getByRole('button', { name: 'Save Changes' }).click()
  await expect(form.getByRole('button', { name: 'Edit Submission' })).toBeVisible()

  await card.getByRole('button', { name: '+ Add New Submission' }).click()
  await card.getByLabel('Response (optional when a file is attached)')
    .fill('Second independent full-stack attempt')
  await card.getByRole('button', { name: 'Submit New Attempt' }).click()
  await expect(card.getByText('New attempt added successfully.')).toBeVisible()

  // Verify persistence through real authenticated API reads.
  const studentToken = await token(request, 'student')
  const id = await assignmentId(request, 'E2E Multiple Attempts')
  const submissions = await request.get(`${API}/api/submissions/my-submissions`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  })
  expect(submissions.ok()).toBeTruthy()
  const submission = (await submissions.json() as Array<{ id: number; assignment_id: number }>)
    .find(s => s.assignment_id === id)
  expect(submission).toBeDefined()
  const attemptResponse = await request.get(
    `${API}/api/submission-attempts/submissions/${submission!.id}`,
    { headers: { Authorization: `Bearer ${studentToken}` } },
  )
  expect(attemptResponse.ok()).toBeTruthy()
  const attempts = await attemptResponse.json() as Array<{
    id: number; attempt_number: number; text_response: string; feedback: string | null
  }>
  expect(attempts).toHaveLength(2)
  expect(attempts.map(a => a.attempt_number)).toEqual([1, 2])
  expect(attempts[0].text_response).toBe('Edited first full-stack solution')
  expect(attempts[1].text_response).toBe('Second independent full-stack attempt')

  await page.getByRole('button', { name: 'Logout' }).click()
  await signIn(page, 'professor')
  await openAssignments(page, true)
  const professorCard = await assignmentCard(page, 'E2E Multiple Attempts')
  await professorCard.getByRole('button', { name: 'View submission attempts and feedback' }).click()
  const firstAttempt = professorCard.locator('.attempt-review-card')
    .filter({ has: page.getByText('Attempt 1', { exact: true }) })
  await expect(firstAttempt).toBeVisible()
  await firstAttempt.getByRole('textbox', { name: 'Professor feedback for Attempt 1' })
    .fill('Improve the introduction before your next attempt.')
  await firstAttempt.getByRole('button', { name: 'Save Feedback' }).click()
  await expect(professorCard.getByText('Feedback saved for Attempt 1.')).toBeVisible()

  await page.getByRole('button', { name: 'Logout' }).click()
  await signIn(page, 'student')
  await openAssignments(page)
  const studentCard = await assignmentCard(page, 'E2E Multiple Attempts')
  await studentCard.getByRole('button', { name: 'View submission attempts and feedback' }).click()
  await expect(studentCard.getByText('Improve the introduction before your next attempt.')).toBeVisible()
})

test('professor grades a closed submission; student sees the result', async ({ page, request }) => {
  await signIn(page, 'professor')
  await openAssignments(page, true)
  const card = await assignmentCard(page, 'E2E Final Grading')
  const grading = card.locator('.grading-section')
  await grading.getByRole('button', { name: 'View submission' }).click()
  await expect(grading.getByRole('button', { name: 'Grade Submission' })).toBeVisible()
  await grading.getByRole('button', { name: 'Grade Submission' }).click()
  await grading.getByLabel(/Score \(maximum/).fill('88')
  await grading.getByLabel('Professor Feedback').fill('Good final submission.')
  await grading.getByRole('button', { name: 'Save Grade' }).click()
  await expect(grading.getByText(/Grade saved for student/)).toBeVisible()

  const studentToken = await token(request, 'student')
  const response = await request.get(`${API}/api/submissions/my-submissions`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  })
  expect(response.ok()).toBeTruthy()
  const id = await assignmentId(request, 'E2E Final Grading')
  const graded = (await response.json() as Array<{
    assignment_id: number; score: number | string | null; feedback: string | null
  }>).find(s => s.assignment_id === id)
  expect(graded).toBeDefined()
  expect(Number(graded!.score)).toBe(88)
  expect(graded!.feedback).toBe('Good final submission.')

  await page.getByRole('button', { name: 'Logout' }).click()
  await signIn(page, 'student')
  await openAssignments(page)
  const studentCard = await assignmentCard(page, 'E2E Final Grading')
  await expect(studentCard).toContainText('88')
  await expect(studentCard.getByRole('button', { name: 'Edit Submission' })).toHaveCount(0)
})

test('real backend enforces enrollment and deadline permissions', async ({ request }) => {
  const outsiderToken = await token(request, 'outsider')
  const studentToken = await token(request, 'student')
  const professorToken = await token(request, 'professor')
  const openId = await assignmentId(request, 'E2E Single Submission')
  const closedId = await assignmentId(request, 'E2E Final Grading')

  const unauthorized = await request.post(`${API}/api/submissions/assignments/${openId}`, {
    headers: { Authorization: `Bearer ${outsiderToken}` },
    multipart: { text_response: 'Not enrolled' },
  })
  expect(unauthorized.status()).toBe(403)

  const expired = await request.post(`${API}/api/submissions/assignments/${closedId}`, {
    headers: { Authorization: `Bearer ${studentToken}` },
    multipart: { text_response: 'Too late' },
  })
  expect(expired.status()).toBe(409)

  const beforeDeadline = await request.get(`${API}/api/submissions/assignments/${openId}`, {
    headers: { Authorization: `Bearer ${professorToken}` },
  })
  expect(beforeDeadline.ok()).toBeTruthy()
})
