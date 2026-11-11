import type { CatalogCourse } from './CourseCatalog'

type Props = {
  course: CatalogCourse | undefined
}

export default function CourseOverview({ course }: Props) {
  return (
    <section className="panel course-overview" aria-labelledby="course-overview-title">
      <div className="course-overview-heading">
        <div>
          <p className="course-kicker">COURSE HOME</p>
          <h2 id="course-overview-title">Course Overview</h2>
        </div>
        {course && <span className="course-code">{course.course_code}</span>}
      </div>
      <p className="course-overview-description">{course?.description || 'Welcome to this course.'}</p>
      <div className="course-overview-navigation" aria-label="Available course sections">
        <div><span aria-hidden="true">▦</span><strong>Materials</strong><small>Review shared course resources</small></div>
        <div><span aria-hidden="true">✓</span><strong>Assignments</strong><small>See instructions and submissions</small></div>
        <div><span aria-hidden="true">▣</span><strong>Meetings</strong><small>View scheduled class sessions</small></div>
      </div>
      <p className="course-overview-hint">Use the course navigation above to open a section.</p>
    </section>
  )
}
