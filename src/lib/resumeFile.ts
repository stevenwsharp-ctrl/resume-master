// Pulls plain text out of an uploaded resume in the browser, so the file
// itself never has to leave the user's machine. The PDF and Word parsers are
// loaded only when someone actually uploads a file.
import type { Profile, ReferenceResume } from '../types'

export const ACCEPTED_TYPES = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/png,image/jpeg,image/webp,image/gif'

export interface ResumeImage {
  media_type: 'image/jpeg'
  data: string
}

export const MAX_IMAGES = 5

export const isImage = (file: File) => file.type.startsWith('image/')

// Screenshots go to the AI as images. Shrinking them first keeps uploads
// small; 2000px on the long side is still plenty to read resume text.
export async function prepareImage(file: File): Promise<ResumeImage> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`Couldn't open ${file.name || 'that image'}. Try a PNG or JPEG.`)
  })
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
  return { media_type: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) }
}

const MAX_BYTES = 10 * 1024 * 1024

export async function extractResumeText(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error('That file is over 10 MB. Try a smaller copy, or paste the text instead.')
  const name = file.name.toLowerCase()
  let text: string
  if (name.endsWith('.pdf') || file.type === 'application/pdf') text = await pdfText(file)
  else if (name.endsWith('.docx')) text = await docxText(file)
  else if (name.endsWith('.doc')) throw new Error('Old .doc files are not supported. Save it as .docx or PDF, or paste the text instead.')
  else text = await file.text()
  text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim()
  if (text.length < 100) {
    throw new Error("Couldn't find readable text in that file (scanned PDFs are images). Paste the text instead.")
  }
  return text.slice(0, 50000)
}

async function pdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let line = ''
    const lines: string[] = []
    for (const item of content.items) {
      if (!('str' in item)) continue
      line += item.str
      if (item.hasEOL) {
        lines.push(line)
        line = ''
      }
    }
    if (line) lines.push(line)
    pages.push(lines.join('\n'))
  }
  return pages.join('\n\n')
}

async function docxText(file: File): Promise<string> {
  const mammoth = await import('mammoth/mammoth.browser.min.js')
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return result.value
}

export type ImportedProfile = Omit<Profile, 'reference_resume'>

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// Fills in what the profile is missing without overwriting anything the
// user already wrote: empty fields get the resume's value, list sections get
// any entries they don't already have.
export function mergeImported(profile: Profile, imported: ImportedProfile, reference: ReferenceResume): Profile {
  const next: Profile = { ...profile, reference_resume: reference }
  const textKeys = ['name', 'headline', 'email', 'phone', 'location', 'links', 'background', 'certifications', 'extra'] as const
  for (const key of textKeys) {
    if (!next[key].trim() && imported[key]) next[key] = imported[key]
  }

  const have = new Set(next.skills.split(/[,\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean))
  const newSkills = imported.skills
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s && !have.has(s.toLowerCase()))
  if (newSkills.length) next.skills = [next.skills.trim(), newSkills.join(', ')].filter(Boolean).join(', ')

  next.experience = [
    ...next.experience,
    ...imported.experience.filter(
      (job) => !next.experience.some((e) => sameText(e.title, job.title) && sameText(e.company, job.company)),
    ),
  ]
  next.education = [
    ...next.education,
    ...imported.education.filter(
      (ed) => !next.education.some((e) => sameText(e.degree, ed.degree) && sameText(e.school, ed.school)),
    ),
  ]
  next.projects = [
    ...next.projects,
    ...imported.projects.filter((p) => !next.projects.some((e) => sameText(e.name, p.name))),
  ]
  return next
}
