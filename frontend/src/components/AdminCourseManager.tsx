import { useCallback, useEffect, useState, type FormEvent } from 'react'
import './admin-course-manager.css'

export type ManagedCourse = {
  id: number
  title: string
  course_code: string
  description: string | null
  professor_id?: number
}
type ManagedUser = {
  id: number
  full_name: string
  email: string
  role: 'admin' | 'professor' | 'student'
  is_active: boolean
}
type Props = {
  token: string
  courses: ManagedCourse[]
  onCoursesChanged: (courses: ManagedCourse[]) => void
}
type Tab = 'courses' | 'professors' | 'students'
type CourseDraft = { title: string; course_code: string; description: string; professor_id: string }
type UserDraft = { full_name: string; email: string; password: string; is_active: boolean }
const blankCourse = (): CourseDraft => ({ title: '', course_code: '', description: '', professor_id: '' })
const blankUser = (): UserDraft => ({ full_name: '', email: '', password: '', is_active: true })

async function request<T>(url: string, token: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...options, headers })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const result: unknown = await response.json()
      if (result && typeof result === 'object' && 'detail' in result) {
        const detail = (result as { detail?: unknown }).detail
        message = typeof detail === 'string' ? detail : JSON.stringify(detail)
      }
    } catch { /* use HTTP status */ }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

async function getAllUsers(token: string, role: 'professor' | 'student'): Promise<ManagedUser[]> {
  const users: ManagedUser[] = []
  for (let offset = 0; offset < 10000; offset += 100) {
    const page = await request<ManagedUser[]>(`/api/users/?role=${role}&limit=100&offset=${offset}`, token)
    users.push(...page)
    if (page.length < 100) return users
  }
  throw new Error(`Too many ${role} records for this interface`)
}

export default function AdminCourseManager({ token, courses, onCoursesChanged }: Props) {
  const [tab, setTab] = useState<Tab>('courses')
  const [professors, setProfessors] = useState<ManagedUser[]>([])
  const [students, setStudents] = useState<ManagedUser[]>([])
  const [form, setForm] = useState<'course' | 'user' | null>(null)
  const [editingCourse, setEditingCourse] = useState<number | null>(null)
  const [editingUser, setEditingUser] = useState<number | null>(null)
  const [courseDraft, setCourseDraft] = useState<CourseDraft>(blankCourse)
  const [userDraft, setUserDraft] = useState<UserDraft>(blankUser)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadUsers = useCallback(async () => {
    const [p, s] = await Promise.all([getAllUsers(token, 'professor'), getAllUsers(token, 'student')])
    setProfessors(p)
    setStudents(s)
  }, [token])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([getAllUsers(token, 'professor'), getAllUsers(token, 'student')])
      .then(([p, s]) => { if (alive) { setProfessors(p); setStudents(s) } })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : 'Unable to load users') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [token])

  async function refreshCourses() {
    const updated = await request<ManagedCourse[]>('/api/courses/', token)
    onCoursesChanged(updated)
  }

  function openNewCourse() {
    setTab('courses'); setEditingCourse(null); setCourseDraft(blankCourse()); setForm('course'); setError(''); setSuccess('')
  }
  function openEditCourse(course: ManagedCourse) {
    setEditingCourse(course.id)
    setCourseDraft({ title: course.title, course_code: course.course_code, description: course.description ?? '', professor_id: String(course.professor_id) })
    setForm('course'); setError(''); setSuccess('')
  }
  function openNewUser(role: 'professor' | 'student') {
    setTab(role === 'professor' ? 'professors' : 'students')
    setEditingUser(null); setUserDraft(blankUser()); setForm('user'); setError(''); setSuccess('')
  }
  function openEditUser(user: ManagedUser) {
    setEditingUser(user.id)
    setUserDraft({ full_name: user.full_name, email: user.email, password: '', is_active: user.is_active })
    setForm('user'); setError(''); setSuccess('')
  }
  function setActiveTab(next: Tab) {
    setTab(next); setForm(null); setError(''); setSuccess('')
  }

  async function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !courseDraft.professor_id) return
    setBusy(true); setError(''); setSuccess('')
    try {
      const payload = {
        title: courseDraft.title.trim(),
        course_code: courseDraft.course_code.trim(),
        description: courseDraft.description.trim() || null,
        professor_id: Number(courseDraft.professor_id),
      }
      await request<ManagedCourse>(editingCourse === null ? '/api/courses/' : `/api/courses/${editingCourse}`, token, {
        method: editingCourse === null ? 'POST' : 'PUT', body: JSON.stringify(payload),
      })
      await refreshCourses()
      setForm(null); setEditingCourse(null)
      setSuccess(editingCourse === null ? 'Course created successfully.' : 'Course updated successfully.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save course') }
    finally { setBusy(false) }
  }

  async function deleteCourse(course: ManagedCourse) {
    if (busy || !window.confirm(`Delete course "${course.title}"? This cannot be undone and may be blocked if students are enrolled.`)) return
    setBusy(true); setError(''); setSuccess('')
    try {
      await request<unknown>(`/api/courses/${course.id}`, token, { method: 'DELETE' })
      await refreshCourses()
      setSuccess('Course deleted.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to delete course') }
    finally { setBusy(false) }
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setSuccess('')
    try {
      const payload = editingUser === null ? {
        full_name: userDraft.full_name.trim(),
        email: userDraft.email.trim(),
        password: userDraft.password,
        role: tab === 'professors' ? 'professor' : 'student',
      } : {
        full_name: userDraft.full_name.trim(),
        email: userDraft.email.trim(),
        is_active: userDraft.is_active,
      }
      await request<ManagedUser>(editingUser === null ? '/api/users/' : `/api/users/${editingUser}`, token, {
        method: editingUser === null ? 'POST' : 'PUT', body: JSON.stringify(payload),
      })
      await loadUsers()
      setForm(null); setEditingUser(null)
      setSuccess(editingUser === null ? 'Account created successfully.' : 'Account updated successfully.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save account') }
    finally { setBusy(false) }
  }

  async function changeUserStatus(user: ManagedUser) {
    const action = user.is_active ? 'deactivate' : 'reactivate'
    if (busy || !window.confirm(`${action[0].toUpperCase()}${action.slice(1)} ${user.full_name}? ${user.is_active ? 'This prevents future sign-ins but preserves records.' : ''}`)) return
    setBusy(true); setError(''); setSuccess('')
    try {
      if (user.is_active) {
        await request<unknown>(`/api/users/${user.id}`, token, { method: 'DELETE' })
      } else {
        await request<ManagedUser>(`/api/users/${user.id}`, token, { method: 'PUT', body: JSON.stringify({ is_active: true }) })
      }
      await loadUsers()
      setSuccess(`Account ${user.is_active ? 'deactivated' : 'reactivated'}.`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update account') }
    finally { setBusy(false) }
  }

  const people = tab === 'professors' ? professors : students
  const role = tab === 'professors' ? 'Professor' : 'Student'
  const availableProfessors = professors.filter(p => p.is_active || (editingCourse !== null && p.id === Number(courseDraft.professor_id)))
  const professorName = (id?: number) => professors.find(p => p.id === id)?.full_name ?? `Professor #${id}`

  return (
    <section className="admin-course-manager panel" aria-label="Administration management">
      <div className="admin-course-manager__header">
        <div>
          <p className="admin-course-manager__eyebrow">ADMINISTRATION</p>
          <h2>Manage university records</h2>
          <p>Create, edit and manage courses, professors and students.</p>
        </div>
      </div>
      <div className="admin-course-manager__tabs" role="tablist" aria-label="Admin management categories">
        {(['courses', 'professors', 'students'] as const).map(t => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''}
            onClick={() => setActiveTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>
      {error && <p role="alert" className="admin-course-manager__error">{error}</p>}
      {success && <p role="status" className="admin-course-manager__success">{success}</p>}
      {loading && <p>Loading account records...</p>}

      {tab === 'courses' && (
        <div className="admin-course-manager__section">
          <div className="admin-course-manager__section-title">
            <h3>Courses <small>({courses.length})</small></h3>
            <button type="button" onClick={openNewCourse} disabled={busy}>+ New Course</button>
          </div>
          {/* Professor choices appear inside Create/Edit Course only. */}
          {form === 'course' && (
            <form className="admin-course-manager__form" onSubmit={event => void saveCourse(event)}>
              <h3 className="admin-course-manager__full">{editingCourse === null ? 'Create course' : 'Edit course'}</h3>
              <label>Course title<input required minLength={2} maxLength={200} value={courseDraft.title}
                onChange={e => setCourseDraft(p => ({ ...p, title: e.target.value }))} /></label>
              <label>Course code<input required minLength={2} maxLength={30} value={courseDraft.course_code}
                onChange={e => setCourseDraft(p => ({ ...p, course_code: e.target.value }))} /></label>
              <label className="admin-course-manager__full">Assign professor
                <select aria-label="Assign professor" required value={courseDraft.professor_id}
                  onChange={e => setCourseDraft(p => ({ ...p, professor_id: e.target.value }))}>
                  <option value="">Select an active professor</option>
                  {availableProfessors.map(p => <option value={p.id} key={p.id}>{p.full_name} ({p.email})</option>)}
                </select>
              </label>
              <label className="admin-course-manager__full">Description<textarea rows={3} value={courseDraft.description}
                onChange={e => setCourseDraft(p => ({ ...p, description: e.target.value }))} /></label>
              <div className="admin-course-manager__actions admin-course-manager__full">
                <button type="submit" disabled={busy || !courseDraft.professor_id}>{busy ? 'Saving...' : editingCourse === null ? 'Create Course' : 'Save Course'}</button>
                <button type="button" className="admin-course-manager__secondary" onClick={() => setForm(null)}>Cancel</button>
              </div>
            </form>
          )}
          {courses.length === 0 && <p>No courses have been created.</p>}
          <div className="admin-course-manager__list">
            {courses.map(course => (
              <div key={course.id} className="admin-course-manager__item">
                <div className="admin-course-manager__course">
                  <strong>{course.title}</strong>
                  <span>{course.course_code} · {professorName(course.professor_id)}</span>
                </div>
                <div className="admin-course-manager__actions">
                  <button type="button" className="admin-course-manager__secondary" onClick={() => openEditCourse(course)}>Edit Course</button>
                  <button type="button" className="admin-course-manager__danger" disabled={busy} onClick={() => void deleteCourse(course)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab !== 'courses' && (
        <div className="admin-course-manager__section">
          <div className="admin-course-manager__section-title">
            <h3>{role}s <small>({people.length})</small></h3>
            <button type="button" onClick={() => openNewUser(tab === 'professors' ? 'professor' : 'student')}>+ Register {role}</button>
          </div>
          {form === 'user' && (
            <form className="admin-course-manager__form" onSubmit={event => void saveUser(event)}>
              <h3 className="admin-course-manager__full">{editingUser === null ? `Register ${role.toLowerCase()}` : `Edit ${role.toLowerCase()}`}</h3>
              <label>Full name<input required minLength={2} maxLength={150} value={userDraft.full_name}
                onChange={e => setUserDraft(p => ({ ...p, full_name: e.target.value }))} /></label>
              <label>Email<input type="email" required value={userDraft.email}
                onChange={e => setUserDraft(p => ({ ...p, email: e.target.value }))} /></label>
              {editingUser === null && <label className="admin-course-manager__full">Initial password (minimum 12 characters)
                <input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={userDraft.password}
                  onChange={e => setUserDraft(p => ({ ...p, password: e.target.value }))} />
              </label>}
              {editingUser !== null && <label className="admin-course-manager__checkbox admin-course-manager__full">
                <input type="checkbox" checked={userDraft.is_active} onChange={e => setUserDraft(p => ({ ...p, is_active: e.target.checked }))} />
                Active account
              </label>}
              <div className="admin-course-manager__actions admin-course-manager__full">
                <button type="submit" disabled={busy}>{busy ? 'Saving...' : editingUser === null ? `Register ${role}` : 'Save Changes'}</button>
                <button type="button" className="admin-course-manager__secondary" onClick={() => setForm(null)}>Cancel</button>
              </div>
            </form>
          )}
          {people.length === 0 && !loading && <p>No {role.toLowerCase()} records found.</p>}
          <div className="admin-course-manager__list">
            {people.map(user => (
              <div key={user.id} className="admin-course-manager__item">
                <div className="admin-course-manager__course">
                  <strong>{user.full_name}</strong>
                  <span>{user.email} · <span className={user.is_active ? 'admin-course-manager__active' : 'admin-course-manager__inactive'}>{user.is_active ? 'Active' : 'Inactive'}</span></span>
                </div>
                <div className="admin-course-manager__actions">
                  <button type="button" className="admin-course-manager__secondary" onClick={() => openEditUser(user)}>Edit</button>
                  <button type="button" disabled={busy} className={user.is_active ? 'admin-course-manager__danger' : 'admin-course-manager__secondary'}
                    onClick={() => void changeUserStatus(user)}>{user.is_active ? 'Deactivate' : 'Reactivate'}</button>
                </div>
              </div>
            ))}
          </div>
          <p className="admin-course-manager__note">Account removal is handled by deactivation, preserving learning and grading records. Password resets and role changes are not supported by the current user-management API.</p>
        </div>
      )}
    </section>
  )
}
