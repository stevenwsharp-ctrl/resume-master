import { useEffect, useRef, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { ACCEPTED_TYPES, MAX_IMAGES, extractResumeText, isImage, prepareImage } from '../lib/resumeFile'
import type { ImportedProfile, ResumeImage } from '../lib/resumeFile'
import type { ReferenceResume } from '../types'

// Sends resume text, or screenshots for the AI to read, and gets back the
// profile fields plus the resume's text (transcribed, for screenshots).
async function readResume(body: { text: string } | { images: ResumeImage[] }) {
  const { data, error } = await supabase.functions.invoke('import-resume', { body })
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
  return data as { profile: ImportedProfile; text: string }
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

  async function runImport(getBody: () => Promise<{ text: string } | { images: ResumeImage[] }>, filename: string) {
    setError(null)
    try {
      setBusy('Reading your resume…')
      const body = await getBody()
      setBusy('Filling in your profile… (about 30 seconds)')
      const { profile, text } = await readResume(body)
      props.onImported(profile, { filename, text, uploaded_at: new Date().toISOString() })
      setPasted('')
      setShowPaste(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function onFiles(files: File[]) {
    if (files.length === 0 || busy) return
    const images = files.filter(isImage)
    if (images.length === files.length) {
      if (images.length > MAX_IMAGES) {
        setError(`Up to ${MAX_IMAGES} screenshots at a time, please.`)
        return
      }
      const name = images.length === 1 ? images[0].name || 'Screenshot' : `${images.length} screenshots`
      runImport(async () => ({ images: await Promise.all(images.map(prepareImage)) }), name)
    } else if (files.length === 1) {
      runImport(async () => ({ text: await extractResumeText(files[0]) }), files[0].name)
    } else {
      setError('Choose one resume file, or one or more screenshots.')
    }
  }

  // Pasting a screenshot (Ctrl/Cmd+V) anywhere on the profile page imports it.
  const onFilesRef = useRef(onFiles)
  onFilesRef.current = onFiles
  useEffect(() => {
    function onPasteEvent(e: ClipboardEvent) {
      const images = Array.from(e.clipboardData?.files ?? []).filter(isImage)
      if (images.length === 0) return
      e.preventDefault()
      onFilesRef.current(images)
    }
    window.addEventListener('paste', onPasteEvent)
    return () => window.removeEventListener('paste', onPasteEvent)
  }, [])

  function onPasteText() {
    const text = pasted.trim()
    if (text.length < 100) {
      setError('That looks too short to be a resume.')
      return
    }
    runImport(async () => ({ text: text.slice(0, 50000) }), 'Pasted resume')
  }

  return (
    <section className="card import">
      <h2>Start from your old resume</h2>
      <p className="muted">
        Upload a resume you already have (PDF, Word .docx, text, or screenshots of it), or just paste a screenshot
        here with Ctrl+V / Cmd+V. We'll fill in any empty parts of your profile from it, and keep it on file so the AI
        can draw on its skills and accomplishments every time it writes or tailors a resume. Nothing you've already
        typed gets overwritten.
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
          multiple
          className="sr-only"
          onChange={(e) => onFiles(Array.from(e.target.files ?? []))}
          disabled={busy !== null}
        />
        <button className="primary" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
          {props.reference ? 'Upload a different resume' : 'Upload resume or screenshot'}
        </button>
        {busy && <span className="muted small">{busy}</span>}
      </div>

      {showPaste ? (
        <>
          <label className="paste">
            Paste your resume text
            <textarea rows={8} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          </label>
          <button onClick={onPasteText} disabled={busy !== null || !pasted.trim()}>
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
