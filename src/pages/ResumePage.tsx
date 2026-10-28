import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { ResumeContent, ResumeRow, ResumeVersion } from '../types'
import ResumeDocument from '../components/ResumeDocument'
import ResumeEditor from '../components/ResumeEditor'
import AtsPanel from '../components/AtsPanel'
import { downloadDocx } from '../lib/resumeDocx'
import ResumeRevise from '../components/ResumeRevise'
import { usePageCount } from '../lib/pageCount'
import { hoursLabel } from '../lib/format'

const MAX_HISTORY = 15

export default function ResumePage() {
  const { id } = useParams()
  const [row, setRow] = useState<ResumeRow | null>(null)
  const [draft, setDraft] = useState<ResumeContent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const pages = usePageCount(row?.content ?? null, row?.format ?? 'standard')

  useEffect(() => {
    supabase
      .from('resumes')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setRow(data as ResumeRow)
      })
  }, [id])

  async function saveEdits() {
    if (!row || !draft) return
    const history = [...(row.history ?? []), versionOf(row, 'Before your edits')].slice(-MAX_HISTORY)
    const patch = { content: draft, history, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('resumes').update(patch).eq('id', row.id)
    if (error) setError(error.message)
    else {
      setRow({ ...row, ...patch })
      setDraft(null)
      flash('Saved')
    }
  }

  async function undo() {
    if (!row || !row.history?.length) return
    const previous = row.history[row.history.length - 1]
    const patch = {
      content: previous.content,
      format: previous.format ?? row.format,
      history: row.history.slice(0, -1),
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('resumes').update(patch).eq('id', row.id)
    if (error) setError(error.message)
    else {
      setRow({ ...row, ...patch })
      flash('Went back to the previous version')
    }
  }

  function flash(text: string) {
    setStatus(text)
    setTimeout(() => setStatus(null), 2500)
  }

  async function copyText() {
    if (!row) return
    await navigator.clipboard.writeText(toPlainText(row.content))
    flash('Copied as plain text')
  }

  if (error) return <main className="page"><p className="error">{error}</p><Link to="/">Back</Link></main>
  if (!row) return <main className="page">Loading…</main>

  return (
    <main className="page wide">
      <div className="toolbar no-print">
        <Link to="/">← My resumes</Link>
        <div className="row">
          {status && <span className="muted small">{status}</span>}
          {draft ? (
            <>
              <button onClick={() => setDraft(null)}>Cancel</button>
              <button className="primary" onClick={saveEdits}>Save changes</button>
            </>
          ) : (
            <>
              {row.history?.length > 0 && (
                <button onClick={undo} title={row.history[row.history.length - 1].reason}>
                  ↶ Undo
                </button>
              )}
              <button onClick={() => setDraft(structuredClone(row.content))}>Edit</button>
              <button onClick={copyText}>Copy text</button>
              <button onClick={() => downloadDocx(row.content, fileName(row), row.format).catch((e) => setError(String(e)))}>Download Word</button>
              <button className="primary" onClick={() => window.print()}>Download PDF</button>
            </>
          )}
        </div>
      </div>

      <div className="resume-layout">
        <div>
          {!draft && <ResumeRevise row={row} pages={pages} onRevised={setRow} />}
          {draft ? <ResumeEditor value={draft} onChange={setDraft} /> : <ResumeDocument resume={row.content} format={row.format} />}
        </div>
        <aside className="no-print">
          <div className="card">
            <h3>{row.title}</h3>
            {row.job_url && (
              <p className="small">
                <a href={row.job_url} target="_blank" rel="noreferrer">Open job posting</a>
              </p>
            )}
            <p className="muted small">Created {new Date(row.created_at).toLocaleString()}</p>
            <PageMeter pages={pages} federal={row.format === 'federal'} />
          </div>
          <AtsPanel resume={draft ?? row.content} notes={row.notes} />
          {row.notes && (
            <>
              {!row.notes.ats && row.notes.match_keywords.length > 0 && (
                <div className="card">
                  <h3>Keywords matched</h3>
                  <div className="chips">
                    {row.notes.match_keywords.map((k) => <span key={k} className="chip">{k}</span>)}
                  </div>
                </div>
              )}
              {row.notes.gaps.length > 0 && (
                <div className="card">
                  <h3>Possible gaps</h3>
                  <ul className="small">{row.notes.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
                </div>
              )}
              {row.notes.tips.length > 0 && (
                <div className="card">
                  <h3>Tips</h3>
                  <ul className="small">{row.notes.tips.map((t) => <li key={t}>{t}</li>)}</ul>
                  <p className="small"><Link to="/profile">Update your profile</Link> and re-tailor to use them.</p>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </main>
  )
}

function fileName(row: ResumeRow): string {
  const base = [row.content.name, 'Resume', row.company].filter(Boolean).join(' ')
  return `${base.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Resume'}.docx`
}

function versionOf(row: ResumeRow, reason: string): ResumeVersion {
  return { content: row.content, format: row.format, saved_at: row.updated_at, reason }
}

function PageMeter({ pages, federal }: { pages: number | null; federal: boolean }) {
  if (pages === null) return null
  const over = federal && pages > 2
  return (
    <p className={`small page-meter${over ? ' over' : ''}`}>
      <strong>{federal ? 'Federal format' : 'Length'}:</strong> about {pages.toFixed(1)} printed {pages > 1.05 ? 'pages' : 'page'}
      {federal && (over ? '. Over the two-page limit: USAJOBS will reject it.' : '. Within the two-page limit.')}
    </p>
  )
}

function toPlainText(r: ResumeContent): string {
  const lines: string[] = [r.name, r.headline]
  lines.push([r.contact.email, r.contact.phone, r.contact.location, ...r.contact.links].filter(Boolean).join(' | '))
  if (r.summary) lines.push('', 'PROFESSIONAL SUMMARY', r.summary)
  if (r.skills.length) {
    lines.push('', 'SKILLS')
    for (const s of r.skills) lines.push(s.category ? `${s.category}: ${s.items.join(', ')}` : s.items.join(', '))
  }
  if (r.experience.length) {
    lines.push('', 'WORK EXPERIENCE')
    for (const e of r.experience) {
      const hours = e.hours_per_week ? `, ${hoursLabel(e.hours_per_week)}` : ''
      lines.push(`${e.title}${e.series_grade ? `, ${e.series_grade}` : ''}, ${e.company}${e.location ? `, ${e.location}` : ''} (${e.start} - ${e.end}${hours})`)
      for (const b of e.bullets) lines.push(`- ${b}`)
      lines.push('')
    }
  }
  if (r.projects.length) {
    lines.push('PROJECTS')
    for (const p of r.projects) lines.push(`${p.name}: ${p.description}`)
    lines.push('')
  }
  if (r.education.length) {
    lines.push('EDUCATION')
    for (const e of r.education) lines.push([e.degree, e.school, e.year, e.details].filter(Boolean).join(', '))
  }
  if (r.certifications.length) lines.push('', 'CERTIFICATIONS', ...r.certifications)
  return lines.join('\n').trim()
}
