import { useState } from 'react'
import type { FormEvent } from 'react'
import { siteUrl, supabase } from '../lib/supabase'

// Supabase error text is short. Add what the user can do next.
function explain(message: string) {
  if (/invalid login credentials/i.test(message))
    return 'The email or password is not correct. If you do not have an account yet, select "Create an account". If you forgot the password, select "Forgot password".'
  if (/email not confirmed/i.test(message))
    return 'Your email is not confirmed yet. Open the link in the email we sent you, or send the email again below.'
  if (/rate limit/i.test(message)) return 'Too many emails were sent. Wait a few minutes, then try again.'
  if (/already registered/i.test(message)) return 'An account with this email already exists. Sign in, or select "Forgot password".'
  return message
}

export default function AuthPage({ notice }: { notice?: string | null }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(notice ?? null)
  const [needsConfirm, setNeedsConfirm] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    setNeedsConfirm(false)
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(explain(error.message))
        setNeedsConfirm(/email not confirmed/i.test(error.message))
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: siteUrl },
      })
      if (error) setError(explain(error.message))
      else if (data.user && data.user.identities?.length === 0)
        setError(explain('already registered'))
      else if (!data.session) {
        setMessage('Check your email (and the spam folder) for the confirmation link. Then sign in here.')
        setNeedsConfirm(true)
        setMode('signin')
      }
    }
    setBusy(false)
  }

  async function resetPassword() {
    if (!email) {
      setError('Enter your email first.')
      return
    }
    setError(null)
    setMessage(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // "reset=1" tells the site to show the new-password form when the link comes back.
      redirectTo: siteUrl + '?reset=1',
    })
    if (error) setError(explain(error.message))
    else setMessage('Password reset email sent. Open the link in this browser.')
  }

  async function resendConfirmation() {
    if (!email) {
      setError('Enter your email first.')
      return
    }
    setError(null)
    setMessage(null)
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: siteUrl } })
    if (error) setError(explain(error.message))
    else setMessage('Confirmation email sent again. Check the spam folder too.')
  }

  return (
    <main className="auth">
      <section className="hero">
        <h1>
          Resume<span>Master</span>
        </h1>
        <p>
          Tell us about yourself once. Get a polished resume, then paste any job link and get a version
          tailored to that role in seconds. Every resume stays saved in your account.
        </p>
      </section>
      <form className="card auth-card" onSubmit={submit}>
        <h2>{mode === 'signin' ? 'Sign in' : 'Create your account'}</h2>
        <label>
          Email
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            // Lets browsers and password managers offer a strong generated password on sign-up.
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}
        {needsConfirm && (
          <p className="small">
            <button type="button" className="link" onClick={resendConfirmation}>
              Send the confirmation email again
            </button>
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
        <p className="muted small">
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <button type="button" className="link" onClick={() => setMode('signup')}>
                Create an account
              </button>{' '}
              ·{' '}
              <button type="button" className="link" onClick={resetPassword}>
                Forgot password
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" className="link" onClick={() => setMode('signin')}>
                Sign in
              </button>
            </>
          )}
        </p>
      </form>
    </main>
  )
}
