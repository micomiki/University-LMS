
export type CourseSection =
  | 'overview'
  | 'materials'
  | 'assignments'
  | 'meetings'

type Props = {
  activeSection: CourseSection
  onChange: (section: CourseSection) => void
}

const sections: {
  id: CourseSection
  label: string
  icon: string
}[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: '🏠',
  },
  {
    id: 'materials',
    label: 'Course Materials',
    icon: '📚',
  },
  {
    id: 'assignments',
    label: 'Assignments',
    icon: '📝',
  },
  {
    id: 'meetings',
    label: 'Meetings',
    icon: '📹',
  },
]

export default function CourseSubNav({
  activeSection,
  onChange,
}: Props) {
  return (
    <nav
      className="course-subnav"
      aria-label="Course navigation"
    >
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          className={
            'course-subnav-button ' +
            (activeSection === section.id
              ? 'active'
              : '')
          }
          aria-current={
            activeSection === section.id
              ? 'page'
              : undefined
          }
          onClick={() => onChange(section.id)}
        >
          <span aria-hidden="true">
            {section.icon}
          </span>

          {section.label}
        </button>
      ))}
    </nav>
  )
}
