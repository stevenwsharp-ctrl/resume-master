import { useRef, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { ACCEPTED_TYPES, extractResumeText } from '../lib/resumeFile'
import type { ImportedProfile } from '../lib/resumeFile'
import type { ReferenceResume } from '../types'

async function readResume(text: string): Promise<ImportedProfile> {
  const { data, error } = await supabase.functions.invoke('import-resume', { body: { text } })
  if (error) {
    let message = error.message
    if (error instanceof FunctionsHttpError) {
      try {
        message = (await error.context.json()).error ?? message
      } catch {
        // keep the generic message
      }
    }
    throw new Error(message)
  }
  return data.profile as ImportedProfile
}

export default function ResumeImport(props: {
  reference?: ReferenceResume
  onImported: (imported: ImportedProfile, reference: ReferenceResume) => void
  onRemoveReference: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [pasted, setPasted] = useState('')

  async function importText(getText: () => Promise<string>, filename: string) {
    setError(null)
    try {
      setBusy('Reading your resume…')
      const text = await getText()
      setBusy('Filling in your profile… (about 30 seconds)')
      const imported = await readResume(text)
      props.onImported(imported, { filename, text, uploaded_at: new Date().toISOString() })
      setPasted('')
      setShowPaste(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function onFile(file: File | undefined) {
    if (file) importText(() => extractResumeText(file), file.name)
  }

  function onPaste() {
    const text = pasted.trim()
    if (text.length < 100) {
      setError('That looks too short to be a resume.')
      return
    }
    importText(async () => text.slice(0, 50000), 'Pasted resume')
  }

  return (
    <section className="card import">
      <h2>Start from your old resume</h2>
      <p className="muted">
        Upload a resume you already have (PDF, Word .docx or text). We'll fill in any empty parts of your profile from
        it, and keep it on file so the AI can draw on its skills and accomplishments every time it writes or tailors a
        resume. Nothing you've already typed gets overwritten.
      </p>

      {props.reference && (
        <div className="reference">
          <span>
            Using <strong>{props.reference.filename}</strong> as reference
            <span className="muted small"> · added {new Date(props.reference.uploaded_at).toLocaleDateString()}</span>
          </span>
          <button className="link danger small" onClick={props.onRemoveReference} disabled={busy !== null}>
            Stop using it
          </button>
        </div>
      )}

      <div className="row">
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_TYPES}
          className="sr-only"
          id="resume-file"
          onChange={(e) => onFile(e.target.files?.[0])}
          disabled={busy !== null}
        />
        <button className="primary" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
          {props.reference ? 'Upload a different resume' : 'Upload resume'}
        </button>
        {busy && <span className="muted small">{busy}</span>}
      </div>

      {showPaste ? (
        <>
          <label className="paste">
            Paste your resume text
            <textarea rows={8} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          </label>
          <button onClick={onPaste} disabled={busy !== null || !pasted.trim()}>
            Use this text
          </button>
        </>
      ) : (
        <button type="button" className="link small" onClick={() => setShowPaste(true)}>
          Or paste the text instead
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
