import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { ResumeRow } from '../types'

type ListRow = Pick<ResumeRow, 'id' | 'kind' | 'title' | 'company' | 'job_url' | 'created_at'>

async function generateResume(body: { job_url?: string; job_text?: string }) {
  const { data, error } = await supabase.functions.invoke('tailor', { body })
  if (error) {
    let message = error.message
    let needsText = false
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = await error.context.json()
        message = payload.error ?? message
        needsText = Boolean(payload.needs_text)
      } catch {
        // keep the generic message
      }
    }
    return { error: message, needsText }
  }
  return { resume: data.resume as ResumeRow }
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ListRow[]>([])
  const [hasProfile, setHasProfile] = useState(true)
  const [loading, setLoading] = useState(true)
  const [jobUrl, setJobUrl] = useState('')
  const [jobText, setJobText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [busy, setBusy] = useState<null | 'master' | 'tailor'>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase
        .from('resumes')
        .select('id, kind, title, company, job_url, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('user_id').maybeSingle(),
    ]).then(([resumes, profile]) => {
      if (resumes.error) setError(resumes.error.message)
      setRows(resumes.data ?? [])
      setHasProfile(Boolean(profile.data))
      setLoading(false)
    })
  }, [])

  async function run(kind: 'master' | 'tailor', e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    setBusy(kind)
    const result = await generateResume(
      kind === 'master' ? {} : { job_url: jobUrl.trim() || undefined, job_text: jobText.trim() || undefined },
    )
    setBusy(null)
    if (result.error) {
      setError(result.error)
      if (result.needsText) setShowPaste(true)
      return
    }
    navigate(`/resume/${result.resume!.id}`)
  }

  async function remove(id: string) {
    const { error } = await supabase.from('resumes').delete().eq('id', id)
    if (error) setError(error.message)
    else setRows((r) => r.filter((x) => x.id !== id))
  }

  const master = rows.filter((r) => r.kind === 'master')
  const tailored = rows.filter((r) => r.kind === 'tailored')

  return (
    <main className="page">
      <h1>My resumes</h1>
      {!loading && !hasProfile && (
        <div className="card callout">
          <strong>Start here:</strong> fill in <Link to="/profile">your profile</Link> with your background,
          experience and skills. Then come back to generate your resumes.
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <section className="card tailor">
        <h2>Tailor for a job</h2>
        <p className="muted">Paste the link to the job posting. We'll read it and rewrite your resume to fit.</p>
        <form onSubmit={(e) => run('tailor', e)}>
          <div className="row">
            <input
              type="url"
              placeholder="https://company.com/careers/job-123"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
            />
            <button className="primary" disabled={!hasProfile || busy !== null || (!jobUrl.trim() && !jobText.trim())}>
              {busy === 'tailor' ? 'Tailoring… (about a minute)' : 'Tailor my resume'}
            </button>
          </div>
          {showPaste ? (
            <label>
              Job description (paste it here if the link can't be read, for example LinkedIn postings that need sign-in)
              <textarea rows={8} value={jobText} onChange={(e) => setJobText(e.target.value)} />
            </label>
          ) : (
            <button type="button" className="link small" onClick={() => setShowPaste(true)}>
              Or paste the job description instead
            </button>
          )}
        </form>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Master resume</h2>
          <button onClick={() => run('master')} disabled={!hasProfile || busy !== null}>
            {busy === 'master' ? 'Writing… (about a minute)' : master.length ? 'Regenerate from profile' : 'Generate my resume'}
          </button>
        </div>
        <p className="muted small">Your best all-purpose resume, built from your full profile.</p>
        <ResumeList rows={master} onRemove={remove} />
      </section>

      <section className="card">
        <h2>Tailored resumes</h2>
        {loading ? <p className="muted">Loading…</p> : <ResumeList rows={tailored} onRemove={remove} empty="None yet. Paste a job link above." />}
      </section>
    </main>
  )
}

function ResumeList({ rows, onRemove, empty }: { rows: ListRow[]; onRemove: (id: string) => void; empty?: string }) {
  if (rows.length === 0) return empty ? <p className="muted">{empty}</p> : null
  return (
    <ul className="resume-list">
      {rows.map((r) => (
        <li key={r.id}>
          <Link to={`/resume/${r.id}`}>
            <strong>{r.title}</strong>
            <span className="muted small">{new Date(r.created_at).toLocaleDateString()}</span>
          </Link>
          {r.job_url && (
            <a className="small" href={r.job_url} target="_blank" rel="noreferrer">
              job posting
            </a>
          )}
          <button
            className="link danger small"
            onClick={() => {
              if (window.confirm(`Delete "${r.title}"?`)) onRemove(r.id)
            }}
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  )
}
