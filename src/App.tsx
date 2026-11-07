import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { clearEmailLinkFromUrl, emailLinkResult, isConfigured, supabase } from './lib/supabase'
import AuthPage from './pages/AuthPage'
import NewPasswordPage from './pages/NewPasswordPage'
import ProfilePage from './pages/ProfilePage'
import DashboardPage from './pages/DashboardPage'
import ResumePage from './pages/ResumePage'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authNotice, setAuthNotice] = useState<string | null>(emailLinkResult.error)
  const [settingPassword, setSettingPassword] = useState(emailLinkResult.isPasswordReset)

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data, error }) => {
      setSession(data.session)
      if (error) setAuthNotice(error.message)
      // The email link was opened, but no session came from it. This happens when the link
      // opens in a different browser or app than the one used to sign up. The email address
      // is still confirmed, so the user can sign in with the password.
      else if (emailLinkResult.hadCode && !data.session && !emailLinkResult.error)
        setAuthNotice(
          emailLinkResult.isPasswordReset
            ? 'This reset link opened in a different browser. Open the link in the browser where you asked for it, or ask for a new link here.'
            : 'Your email is confirmed. Sign in with your email and password.',
        )
      clearEmailLinkFromUrl()
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setSettingPassword(true)
    })
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
  if (!session) return <AuthPage notice={authNotice} />
  if (settingPassword) return <NewPasswordPage onDone={() => setSettingPassword(false)} />

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
