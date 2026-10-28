import { useState } from 'react'
import type { FormEvent } from 'react'
import { callFunction } from '../lib/functions'
import type { ResumeFormat, ResumeRow } from '../types'

// "Ask for changes": the user types or pastes what they want fixed, and the AI
// rewrites this resume. The old version is kept so Undo can bring it back.
export default function ResumeRevise({
  row,
  pages,
  onRevised,
}: {
  row: ResumeRow
  pages: number | null
  onRevised: (row: ResumeRow) => void
}) {
  const [request, setRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const federal = row.format === 'federal'

  const suggestions: { label: string; text: string; format?: ResumeFormat }[] = [
    ...(federal && pages !== null && pages > 2
      ? [{ label: 'Fit it on two pages', text: 'Cut this down so it fits on two printed pages. Keep the most relevant and recent experience.' }]
      : []),
    { label: 'Tighten the wording', text: 'Make the bullets shorter and punchier without losing any results or numbers.' },
    { label: 'Stronger summary', text: 'Rewrite the summary so it is more specific and confident.' },
    federal
      ? { label: 'Back to a standard resume', text: 'Convert this to a standard private-sector resume.', format: 'standard' }
      : {
          label: 'Make it a federal (USAJOBS) resume',
          text: "Convert this to OPM's federal two-page resume format.",
          format: 'federal',
        },
  ]

  async function submit(e?: FormEvent, preset?: { text: string; format?: ResumeFormat }) {
    e?.preventDefault()
    const text = preset?.text ?? request
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    setSummary(null)
    if (preset) setRequest(preset.text)
    const { data, error } = await callFunction<{ resume: ResumeRow; change_summary: string }>('revise', {
      resume_id: row.id,
      request: text,
      format: preset?.format,
      pages: pages ?? undefined,
    })
    setBusy(false)
    if (error) {
      setError(error)
      return
    }
    onRevised(data!.resume)
    setSummary(data!.change_summary)
    setRequest('')
  }

  return (
    <section className="card revise no-print">
      <h2>Ask for changes</h2>
      <form onSubmit={submit}>
        <label>
          Spotted something to fix? Say what you want, or paste in details to add.
          <textarea
            rows={4}
            value={request}
            disabled={busy}
            placeholder={'Lead with my project management experience.\nAdd that I cut onboarding time by 30% at Acme.\nDrop the 2012 internship.'}
            onChange={(e) => setRequest(e.target.value)}
          />
        </label>
        <div className="row revise-actions">
          <button className="primary" disabled={busy || !request.trim()}>
            {busy ? 'Rewriting… (about a minute)' : 'Regenerate'}
          </button>
          <span className="muted small">Your current version is kept. Use Undo at the top to go back.</span>
        </div>
      </form>
      <p className="small suggestions">
        <span className="muted">Or try:</span>{' '}
        {suggestions.map((s, i) => (
          <span key={s.label}>
            {i > 0 && <span className="muted"> · </span>}
            <button type="button" className="link" disabled={busy} onClick={() => submit(undefined, s)}>
              {s.label}
            </button>
          </span>
        ))}
      </p>
      {summary && <p className="done small"><strong>Done.</strong> {summary}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
