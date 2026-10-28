import { Link } from 'react-router-dom'
import type { ResumeContent, ResumeNotes } from '../types'
import { checkResume } from '../lib/atsCheck'

// Sidebar report on how the resume should fare with ATS filters and recruiters.
// Recomputed from the resume as it is edited.
export default function AtsPanel({ resume, notes }: { resume: ResumeContent; notes: ResumeNotes | null }) {
  const ats = notes?.ats
  const report = checkResume(resume, ats?.keywords)
  const missing = report.keywords.filter((k) => !k.found)
  const found = report.keywords.filter((k) => k.found)
  const failing = report.checks.filter((c) => !c.ok)

  return (
    <>
      <div className="card ats">
        <h3>ATS check</h3>
        <p className="ats-score">
          <strong>{report.score}</strong>
          <span className="muted small"> / 100 {report.keywords.length ? 'keyword and format match' : 'format score'}</span>
        </p>
        <ul className="ats-checks small">
          {report.checks.map((c) => (
            <li key={c.label} className={c.ok ? 'ok' : 'bad'}>
              {c.label}
              {!c.ok && c.detail && <span className="muted"> {c.detail}</span>}
            </li>
          ))}
        </ul>
        {failing.length === 0 && <p className="small muted">Format looks clean for ATS parsing.</p>}
      </div>

      {report.keywords.length > 0 && (
        <div className="card">
          <h3>Keywords</h3>
          {found.length > 0 && (
            <>
              <p className="small muted">On your resume ({found.length} of {report.keywords.length})</p>
              <div className="chips">{found.map((k) => <span key={k.term} className="chip">{k.term}</span>)}</div>
            </>
          )}
          {missing.length > 0 && (
            <>
              <p className="small muted">Not on your resume. Add only the ones you can back up:</p>
              <div className="chips">
                {missing.map((k) => (
                  <span key={k.term} className={`chip missing ${k.importance}`} title={k.importance}>
                    {k.term}{k.importance === 'required' && ' *'}
                  </span>
                ))}
              </div>
              {missing.some((k) => k.importance === 'required') && <p className="small muted">* listed as required</p>}
            </>
          )}
        </div>
      )}

      {ats && ats.modernized.length > 0 && (
        <div className="card">
          <h3>Updated wording</h3>
          <ul className="small">
            {ats.modernized.map((m) => <li key={m.from + m.to}>"{m.from}" → <strong>{m.to}</strong></li>)}
          </ul>
        </div>
      )}

      {ats && ats.trending.length > 0 && (
        <div className="card">
          <h3>In demand in your field</h3>
          <div className="chips">{ats.trending.map((t) => <span key={t} className="chip missing">{t}</span>)}</div>
          <p className="small">
            Employers are asking for these and your profile doesn't show them. If you have the experience,{' '}
            <Link to="/profile">add it to your profile</Link> and regenerate.
          </p>
        </div>
      )}
    </>
  )
}
