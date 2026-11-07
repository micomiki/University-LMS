// Test helper: lightweight Fetch response with no server or PostgreSQL connection.
export function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

// datetime-local inputs expect a local-time string (YYYY-MM-DDTHH:mm).
export function localDateTimeHoursFromNow(hours: number): string {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(), '-', pad(date.getMonth() + 1), '-', pad(date.getDate()),
    'T', pad(date.getHours()), ':', pad(date.getMinutes()),
  ].join('')
}

export const exampleAttempt = {
  id: 101,
  submission_id: 15,
  attempt_number: 1,
  text_response: 'Project first attempt',
  original_filename: null,
  submitted_at: '2026-11-01T10:00:00Z',
  feedback: 'Please improve the architecture.',
  reviewed_by: 8,
  reviewed_at: '2026-11-02T10:00:00Z',
}
