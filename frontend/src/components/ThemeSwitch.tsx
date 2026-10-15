import type { ReactNode } from 'react'
import { setThemePreference, type ThemePreference, useThemePreference } from '../lib/theme'

const icon = (children: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)

const OPTIONS: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  {
    value: 'system',
    label: 'System theme',
    icon: icon(<><rect x="1.75" y="2.5" width="12.5" height="8.5" rx="1.25" /><path d="M5.5 13.75h5M8 11v2.75" /></>),
  },
  {
    value: 'light',
    label: 'Light theme',
    icon: icon(<><circle cx="8" cy="8" r="2.75" /><path d="M8 1.25v1.5M8 13.25v1.5M1.25 8h1.5M13.25 8h1.5M3.2 3.2l1.06 1.06M11.74 11.74l1.06 1.06M3.2 12.8l1.06-1.06M11.74 4.26l1.06-1.06" /></>),
  },
  {
    value: 'dark',
    label: 'Dark theme',
    icon: icon(<path d="M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1z" />),
  },
]

export function ThemeSwitch() {
  const preference = useThemePreference()
  return (
    <div className="segmented theme-switch" role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map((option) => (
        <label key={option.value} title={option.label}>
          <input type="radio" name="theme" checked={preference === option.value}
            onChange={() => setThemePreference(option.value)} />
          {option.icon}
          <span className="sr-only">{option.label}</span>
        </label>
      ))}
    </div>
  )
}
