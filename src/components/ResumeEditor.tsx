import type { ResumeContent } from '../types'

// Edits a generated resume in place. Lists are edited one item per line.
export default function ResumeEditor({ value: r, onChange }: { value: ResumeContent; onChange: (r: ResumeContent) => void }) {
  const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean)
  const update = (patch: Partial<ResumeContent>) => onChange({ ...r, ...patch })

  return (
    <div className="card editor">
      <div className="grid2">
        <label>Name<input value={r.name} onChange={(e) => update({ name: e.target.value })} /></label>
        <label>Headline<input value={r.headline} onChange={(e) => update({ headline: e.target.value })} /></label>
        <label>Email<input value={r.contact.email} onChange={(e) => update({ contact: { ...r.contact, email: e.target.value } })} /></label>
        <label>Phone<input value={r.contact.phone} onChange={(e) => update({ contact: { ...r.contact, phone: e.target.value } })} /></label>
        <label>Location<input value={r.contact.location} onChange={(e) => update({ contact: { ...r.contact, location: e.target.value } })} /></label>
        <label>
          Links (one per line)
          <textarea rows={2} defaultValue={r.contact.links.join('\n')} onChange={(e) => update({ contact: { ...r.contact, links: lines(e.target.value) } })} />
        </label>
      </div>
      <label>Summary<textarea rows={4} value={r.summary} onChange={(e) => update({ summary: e.target.value })} /></label>

      <h3>Experience</h3>
      {r.experience.map((job, i) => {
        const setJob = (patch: Partial<typeof job>) =>
          update({ experience: r.experience.map((j, k) => (k === i ? { ...j, ...patch } : j)) })
        return (
          <div className="item" key={i}>
            <div className="grid2">
              <label>Title<input value={job.title} onChange={(e) => setJob({ title: e.target.value })} /></label>
              <label>Company<input value={job.company} onChange={(e) => setJob({ company: e.target.value })} /></label>
              <label>Location<input value={job.location} onChange={(e) => setJob({ location: e.target.value })} /></label>
              <div className="grid2 tight">
                <label>Start<input value={job.start} onChange={(e) => setJob({ start: e.target.value })} /></label>
                <label>End<input value={job.end} onChange={(e) => setJob({ end: e.target.value })} /></label>
              </div>
            </div>
            <label>
              Bullets (one per line)
              <textarea rows={Math.max(3, job.bullets.length + 1)} defaultValue={job.bullets.join('\n')} onChange={(e) => setJob({ bullets: lines(e.target.value) })} />
            </label>
            <button className="link danger small" onClick={() => update({ experience: r.experience.filter((_, k) => k !== i) })}>
              Remove this job
            </button>
          </div>
        )
      })}

      <h3>Skills</h3>
      <label>
        One group per line, like "Languages: Python, SQL"
        <textarea
          rows={Math.max(3, r.skills.length + 1)}
          defaultValue={r.skills.map((s) => (s.category ? `${s.category}: ` : '') + s.items.join(', ')).join('\n')}
          onChange={(e) =>
            update({
              skills: lines(e.target.value).map((line) => {
                const idx = line.indexOf(':')
                const category = idx > -1 ? line.slice(0, idx).trim() : ''
                const rest = idx > -1 ? line.slice(idx + 1) : line
                return { category, items: rest.split(',').map((s) => s.trim()).filter(Boolean) }
              }),
            })
          }
        />
      </label>

      <h3>Projects</h3>
      <label>
        One per line, like "Name: description"
        <textarea
          rows={Math.max(2, r.projects.length + 1)}
          defaultValue={r.projects.map((p) => `${p.name}: ${p.description}`).join('\n')}
          onChange={(e) =>
            update({
              projects: lines(e.target.value).map((line) => {
                const idx = line.indexOf(':')
                return idx > -1
                  ? { name: line.slice(0, idx).trim(), description: line.slice(idx + 1).trim() }
                  : { name: line, description: '' }
              }),
            })
          }
        />
      </label>

      <h3>Education</h3>
      {r.education.map((ed, i) => {
        const setEd = (patch: Partial<typeof ed>) =>
          update({ education: r.education.map((x, k) => (k === i ? { ...x, ...patch } : x)) })
        return (
          <div className="grid2 item" key={i}>
            <label>Degree<input value={ed.degree} onChange={(e) => setEd({ degree: e.target.value })} /></label>
            <label>School<input value={ed.school} onChange={(e) => setEd({ school: e.target.value })} /></label>
            <label>Year<input value={ed.year} onChange={(e) => setEd({ year: e.target.value })} /></label>
            <label>Details<input value={ed.details} onChange={(e) => setEd({ details: e.target.value })} /></label>
          </div>
        )
      })}

      <h3>Certifications</h3>
      <label>
        One per line
        <textarea rows={Math.max(2, r.certifications.length + 1)} defaultValue={r.certifications.join('\n')} onChange={(e) => update({ certifications: lines(e.target.value) })} />
      </label>
    </div>
  )
}
