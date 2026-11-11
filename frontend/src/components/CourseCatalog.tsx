import { useMemo, useState } from 'react'
import './course-stage3.css'

export type CatalogCourse = {
  id: number
  title: string
  course_code: string
  description: string | null
}

type Props = {
  courses: CatalogCourse[]
  selectedCourseId: number | null
  loading: boolean
  onOpenCourse: (courseId: number) => void | Promise<void>
}

const cardThemes = ['violet', 'blue', 'teal', 'rose'] as const

export default function CourseCatalog({
  courses,
  selectedCourseId,
  loading,
  onOpenCourse,
}: Props) {
  const [query, setQuery] = useState('')
  const visibleCourses = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    if (!search) return courses
    return courses.filter((course) =>
      `${course.title} ${course.course_code} ${course.description ?? ''}`
        .toLocaleLowerCase()
        .includes(search)
    )
  }, [courses, query])

  return (
    <section className="panel course-catalog" aria-labelledby="courses-heading">
      <header className="course-catalog-header">
        <div>
          <p className="course-kicker">YOUR LEARNING SPACE</p>
          <h2 id="courses-heading">Courses</h2>
          <p className="course-catalog-intro">Browse your courses and pick up where you left off.</p>
        </div>
        <div className="course-count" aria-label={`${courses.length} courses available`}>
          <strong>{courses.length}</strong>
          <span>{courses.length === 1 ? 'Course' : 'Courses'}</span>
        </div>
      </header>

      <label className="course-search-label" htmlFor="course-search">Search courses</label>
      <div className="course-search-wrap">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
        <input
          id="course-search"
          type="search"
          placeholder="Search by title, code or description"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="course-grid">
        {visibleCourses.map((course, index) => (
          <article
            className={`course-card course-catalog-card ${selectedCourseId === course.id ? 'is-selected' : ''}`}
            key={course.id}
          >
            <div className={`course-cover course-cover--${cardThemes[index % cardThemes.length]}`} aria-hidden="true">
              <span className="course-cover-orb" />
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="8" y="11" width="32" height="26" rx="5"/><path d="M8 20h32M19 20v17M29 20v17"/></svg>
            </div>
            <div className="course-card-body">
              <div className="course-card-topline">
                <span className="course-code">{course.course_code}</span>
                {selectedCourseId === course.id && <span className="course-selected">Selected</span>}
              </div>
              <h3>{course.title}</h3>
              <p className="course-description">{course.description || 'No description available.'}</p>
              <button
                type="button"
                className="course-open-button"
                disabled={loading}
                onClick={() => void onOpenCourse(course.id)}
              >
                Open Course <span aria-hidden="true">→</span>
              </button>
            </div>
          </article>
        ))}
      </div>
      {courses.length === 0 && <p className="course-empty">No courses available.</p>}
      {courses.length > 0 && visibleCourses.length === 0 && (
        <p className="course-empty">No courses match your search.</p>
      )}
    </section>
  )
}
