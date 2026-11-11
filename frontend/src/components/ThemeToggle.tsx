import { useEffect, useState } from 'react'

type ThemeMode = 'light' | 'dark'
const STORAGE_KEY = 'university-lms-theme'

function preferredTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(preferredTheme)

  useEffect(() => {
    document.documentElement.dataset.lmsTheme = theme
    try { window.localStorage.setItem(STORAGE_KEY, theme) } catch { /* optional */ }
  }, [theme])

  return (
    <button
      type="button"
      className="stage5-theme-toggle"
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')}
    >
      <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
      <span className="stage5-theme-label">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
    </button>
  )
}
