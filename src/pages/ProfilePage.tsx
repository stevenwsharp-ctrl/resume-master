import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { emptyProfile } from '../types'
import type { Profile, ProfileEducation, ProfileExperience, ProfileProject } from '../types'

type ListKey = 'experience' | 'education' | 'projects'

const blankItem: { experience: ProfileExperience; education: ProfileEducation; projects: ProfileProject } = {
  experience: { title: '', company: '', location: '', start: '', end: '', description: '' },
  education: { degree: '', school: '', year: '', details: '' },
  projects: { name: '', description: '' },
}

export default function ProfilePage({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Profile>(emptyProfile)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    supabase
      .from('profiles')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        if (data) setProfile({ ...emptyProfile, ...(data.data as Partial<Profile>) })
        setLoading(false)
      })
  }, [userId])

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((p) => ({ ...p, [key]: value }))
    setDirty(true)
  }

  function setItem<K extends ListKey>(key: K, index: number, field: string, value: string) {
    const list = [...profile[key]] as unknown as Record<string, string>[]
    list[index] = { ...list[index], [field]: value }
    set(key, list as unknown as Profile[K])
  }

  function addItem(key: ListKey) {
    set(key, [...profile[key], { ...blankItem[key] }] as never)
  }

  function removeItem(key: ListKey, index: number) {
    set(key, profile[key].filter((_, i) => i !== index) as never)
  }

  function moveItem(key: ListKey, index: number, delta: number) {
    const list = [...profile[key]]
    const target = index + delta
    if (target < 0 || target >= list.length) return
    ;[list[index], list[target]] = [list[target], list[index]]
    set(key, list as never)
  }

  async function save() {
    setError(null)
    setStatus('Saving…')
    const { error } = await supabase
      .from('profiles')
      .upsert({ user_id: userId, data: profile, updated_at: new Date().toISOString() })
    if (error) {
      setError(error.message)
      setStatus(null)
    } else {
      setStatus('Saved')
      setDirty(false)
    }
  }

  async function changePassword() {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) setError(error.message)
    else {
      setNewPassword('')
      setStatus('Password updated')
    }
  }

  if (loading) return <main className="page">Loading…</main>

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>My profile</h1>
          <p className="muted">
            Everything about you, in your own words. Don't worry about polish: rough notes, numbers,
            and details are perfect. The more you add, the better your resumes get.
          </p>
        </div>
        <div className="save-bar">
          {status && <span className="muted small">{status}</span>}
          <button className="primary" onClick={save} disabled={!dirty}>
            Save profile
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>Basics</h2>
        <div className="grid2">
          <Field label="Full name" value={profile.name} onChange={(v) => set('name', v)} />
          <Field
            label="Headline (the role you want)"
            placeholder="Senior Product Manager"
            value={profile.headline}
            onChange={(v) => set('headline', v)}
          />
          <Field label="Email" value={profile.email} onChange={(v) => set('email', v)} />
          <Field label="Phone" value={profile.phone} onChange={(v) => set('phone', v)} />
          <Field label="Location" placeholder="Denver, CO" value={profile.location} onChange={(v) => set('location', v)} />
          <Area
            label="Links (one per line)"
            placeholder={'linkedin.com/in/you\ngithub.com/you'}
            rows={2}
            value={profile.links}
            onChange={(v) => set('links', v)}
          />
        </div>
      </section>

      <section className="card">
        <h2>Background</h2>
        <Area
          label="Tell your story: who you are, what you're great at, what you're looking for"
          rows={6}
          value={profile.background}
          onChange={(v) => set('background', v)}
        />
        <Area
          label="Skills, tools and technologies (comma or line separated)"
          rows={3}
          value={profile.skills}
          onChange={(v) => set('skills', v)}
        />
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Experience</h2>
          <button onClick={() => addItem('experience')}>+ Add job</button>
        </div>
        {profile.experience.length === 0 && <p className="muted">Add your jobs, most recent first.</p>}
        {profile.experience.map((job, i) => (
          <div className="item" key={i}>
            <ItemControls onUp={() => moveItem('experience', i, -1)} onDown={() => moveItem('experience', i, 1)} onRemove={() => removeItem('experience', i)} />
            <div className="grid2">
              <Field label="Job title" value={job.title} onChange={(v) => setItem('experience', i, 'title', v)} />
              <Field label="Company" value={job.company} onChange={(v) => setItem('experience', i, 'company', v)} />
              <Field label="Location" value={job.location} onChange={(v) => setItem('experience', i, 'location', v)} />
              <div className="grid2 tight">
                <Field label="Start" placeholder="Mar 2021" value={job.start} onChange={(v) => setItem('experience', i, 'start', v)} />
                <Field label="End" placeholder="Present" value={job.end} onChange={(v) => setItem('experience', i, 'end', v)} />
              </div>
            </div>
            <Area
              label="What you did and achieved (rough notes are fine, include numbers where you can)"
              rows={5}
              value={job.description}
              onChange={(v) => setItem('experience', i, 'description', v)}
            />
          </div>
        ))}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Education</h2>
          <button onClick={() => addItem('education')}>+ Add school</button>
        </div>
        {profile.education.map((ed, i) => (
          <div className="item" key={i}>
            <ItemControls onUp={() => moveItem('education', i, -1)} onDown={() => moveItem('education', i, 1)} onRemove={() => removeItem('education', i)} />
            <div className="grid2">
              <Field label="Degree / program" value={ed.degree} onChange={(v) => setItem('education', i, 'degree', v)} />
              <Field label="School" value={ed.school} onChange={(v) => setItem('education', i, 'school', v)} />
              <Field label="Year" value={ed.year} onChange={(v) => setItem('education', i, 'year', v)} />
              <Field label="Details (honors, GPA, coursework)" value={ed.details} onChange={(v) => setItem('education', i, 'details', v)} />
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Projects</h2>
          <button onClick={() => addItem('projects')}>+ Add project</button>
        </div>
        {profile.projects.map((p, i) => (
          <div className="item" key={i}>
            <ItemControls onUp={() => moveItem('projects', i, -1)} onDown={() => moveItem('projects', i, 1)} onRemove={() => removeItem('projects', i)} />
            <Field label="Project name" value={p.name} onChange={(v) => setItem('projects', i, 'name', v)} />
            <Area label="Description" rows={3} value={p.description} onChange={(v) => setItem('projects', i, 'description', v)} />
          </div>
        ))}
      </section>

      <section className="card">
        <h2>More</h2>
        <Area
          label="Certifications and licenses (one per line)"
          rows={3}
          value={profile.certifications}
          onChange={(v) => set('certifications', v)}
        />
        <Area
          label="Anything else: awards, volunteering, languages, publications, clearances"
          rows={4}
          value={profile.extra}
          onChange={(v) => set('extra', v)}
        />
      </section>

      <div className="save-bar end">
        {status && <span className="muted small">{status}</span>}
        <button className="primary" onClick={save} disabled={!dirty}>
          Save profile
        </button>
      </div>

      <section className="card">
        <h2>Account</h2>
        <div className="row">
          <input
            type="password"
            autoComplete="new-password"
            placeholder="New password (8+ characters)"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button onClick={changePassword} disabled={newPassword.length < 8}>
            Change password
          </button>
        </div>
      </section>
    </main>
  )
}

function Field(props: { label: string; value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <label>
      {props.label}
      <input value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
    </label>
  )
}

function Area(props: { label: string; value: string; rows?: number; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <label>
      {props.label}
      <textarea
        rows={props.rows ?? 4}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  )
}

function ItemControls(props: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div className="item-controls">
      <button title="Move up" onClick={props.onUp}>↑</button>
      <button title="Move down" onClick={props.onDown}>↓</button>
      <button title="Remove" className="danger" onClick={props.onRemove}>Remove</button>
    </div>
  )
}
