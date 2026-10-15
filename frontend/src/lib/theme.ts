import { useMemo, useSyncExternalStore } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

// The resolved theme lives on <html data-theme>, which the CSS tokens key off. index.html sets it before first paint
// with the same rule; this module keeps it in sync with the header switch and the system setting.
const KEY = 'theme'
const system = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function loadPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'    // storage blocked (private window, site data off)
  }
}

let preference = loadPreference()

const isDark = () => (preference === 'system' ? system.matches : preference === 'dark')

function apply() {
  document.documentElement.dataset.theme = isDark() ? 'dark' : 'light'
  listeners.forEach((notify) => notify())
}

apply()
system.addEventListener('change', apply)
// Another tab changed the choice
window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    preference = loadPreference()
    apply()
  }
})

export function setThemePreference(next: ThemePreference) {
  preference = next
  try {
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch {
    // not remembered, but still applied for this visit
  }
  apply()
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

export const useThemePreference = () => useSyncExternalStore(subscribe, () => preference)

export const useDarkMode = () => useSyncExternalStore(subscribe, isDark)

const read = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** Resolved colour tokens for canvas-drawn map layers, which cannot use CSS variables. Re-read on theme change. */
export function useMapColors() {
  const dark = useDarkMode()
  return useMemo(() => readColors(dark), [dark])
}

function readColors(dark: boolean) {
  return {
    dark,
    surface: read('--surface'),
    ink: read('--ink'),
    ink2: read('--ink-2'),
    poi: read('--map-poi'),
    site: read('--series-1'),
    highlight: read('--series-2'),
    gap: read('--series-1'),
    cluster: read('--series-2'),
    seq: [1, 2, 3, 4, 5].map((i) => read(`--seq-${i}`)),
  }
}

export type MapColors = ReturnType<typeof readColors>
