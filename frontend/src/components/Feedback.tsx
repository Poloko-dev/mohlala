import type { ReactNode } from 'react'

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="alert" role="alert">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.5v4.2M8 10.8v.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span>{message}</span>
    </div>
  )
}

export function Callout({ children }: { children: ReactNode }) {
  return <p className="callout">{children}</p>
}

export function Progress({ done, total, label }: { done: number; total: number; label: ReactNode }) {
  const share = total > 0 ? done / total : 0
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <span className="hint">{label}</span>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${Math.max(share * 100, 2)}%` }} />
      </div>
    </div>
  )
}

export function StatTile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {detail && <span className="stat-detail">{detail}</span>}
    </div>
  )
}
