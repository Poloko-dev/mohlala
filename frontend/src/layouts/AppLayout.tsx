import { isRouteErrorResponse, Link, NavLink, Outlet, useRouteError } from 'react-router'
import { ThemeSwitch } from '../components/ThemeSwitch'

const NAV = [
  { to: '/', label: 'Site analysis', end: true },
  { to: '/suggest', label: 'Best sites' },
  { to: '/gaps', label: 'Market gaps' },
  { to: '/new-poi', label: 'New POI' },
  { to: '/pois', label: 'Existing POIs' },
  { to: '/batch', label: 'Batch CSV' },
  { to: '/model', label: 'Model' },
]

function Header() {
  return (
    <header className="app-header">
      <Link to="/" className="brand">
        <svg viewBox="0 0 32 32" aria-hidden>
          <path d="M16 2C10.5 2 6 6.4 6 11.9 6 19.3 16 30 16 30s10-10.7 10-18.1C26 6.4 21.5 2 16 2z" fill="var(--series-1)" />
          <circle cx="16" cy="12" r="4" fill="var(--surface)" />
        </svg>
        <span>Lesotho location intelligence</span>
      </Link>
      <nav className="nav" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <ThemeSwitch />
    </header>
  )
}

export function AppLayout() {
  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}

export function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Something went wrong.'
  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <div className="page">
          <h1>{isRouteErrorResponse(error) && error.status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
          <p className="lead">{message}</p>
          <p>
            <Link to="/">Back to site analysis</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
