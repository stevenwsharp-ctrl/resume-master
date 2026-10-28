import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { isConfigured, supabase } from './lib/supabase'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import DashboardPage from './pages/DashboardPage'
import ResumePage from './pages/ResumePage'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!isConfigured) {
    return (
      <main className="page narrow">
        <h1>Resume Master</h1>
        <p className="card">
          This site isn't connected to its database yet. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> (see the README).
        </p>
      </main>
    )
  }

  if (loading) return <main className="page narrow">Loading…</main>
  if (!session) return <AuthPage />

  return (
    <>
      <header className="topbar no-print">
        <Link to="/" className="brand">
          Resume<span>Master</span>
        </Link>
        <nav>
          <NavLink to="/" end>
            My resumes
          </NavLink>
          <NavLink to="/profile">My profile</NavLink>
          <button className="link" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage userId={session.user.id} />} />
        <Route path="/resume/:id" element={<ResumePage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  )
}
