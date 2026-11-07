import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

// Shown after the user opens a "reset password" email link.
export default function NewPasswordPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('The two passwords are not the same.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <main className="auth">
      <form className="card auth-card" onSubmit={submit}>
        <h2>Set a new password</h2>
        <label>
          New password
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Type it again
          <input
            type="password"
            name="confirm"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Please wait…' : 'Save password'}
        </button>
      </form>
    </main>
  )
}
