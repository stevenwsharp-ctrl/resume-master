import type { ResumeContent } from '../types'

export default function ResumeDocument({ resume: r }: { resume: ResumeContent }) {
  const contact = [r.contact.email, r.contact.phone, r.contact.location, ...r.contact.links].filter(Boolean)
  return (
    <article className="resume">
      <header>
        <h1>{r.name}</h1>
        {r.headline && <p className="headline">{r.headline}</p>}
        {contact.length > 0 && <p className="contact">{contact.join('  ·  ')}</p>}
      </header>

      {r.summary && (
        <section>
          <h2>Professional Summary</h2>
          <p>{r.summary}</p>
        </section>
      )}

      {r.skills.length > 0 && (
        <section>
          <h2>Skills</h2>
          {r.skills.map((s, i) => (
            <p key={i} className="skill-line">
              {s.category && <strong>{s.category}: </strong>}
              {s.items.join(', ')}
            </p>
          ))}
        </section>
      )}

      {r.experience.length > 0 && (
        <section>
          <h2>Work Experience</h2>
          {r.experience.map((e, i) => (
            <div className="entry" key={i}>
              <div className="entry-head">
                <div>
                  <strong>{e.title}</strong>
                  {e.company && <span> · {e.company}</span>}
                  {e.location && <span className="muted"> · {e.location}</span>}
                </div>
                <span className="dates">{[e.start, e.end].filter(Boolean).join(' – ')}</span>
              </div>
              <ul>{e.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
            </div>
          ))}
        </section>
      )}

      {r.projects.length > 0 && (
        <section>
          <h2>Projects</h2>
          {r.projects.map((p, i) => (
            <p key={i}>
              <strong>{p.name}</strong> {p.description && <>— {p.description}</>}
            </p>
          ))}
        </section>
      )}

      {r.education.length > 0 && (
        <section>
          <h2>Education</h2>
          {r.education.map((e, i) => (
            <div className="entry" key={i}>
              <div className="entry-head">
                <div>
                  <strong>{e.degree}</strong>
                  {e.school && <span> · {e.school}</span>}
                </div>
                <span className="dates">{e.year}</span>
              </div>
              {e.details && <p className="small">{e.details}</p>}
            </div>
          ))}
        </section>
      )}

      {r.certifications.length > 0 && (
        <section>
          <h2>Certifications</h2>
          <ul>{r.certifications.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </section>
      )}
    </article>
  )
}
