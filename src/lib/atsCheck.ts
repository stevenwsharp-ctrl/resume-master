// Quick checks for what applicant tracking systems and recruiters look for.
// Runs in the browser on the current resume, so results update as it's edited.
import type { AtsKeyword, ResumeContent } from '../types'

export interface AtsCheck {
  label: string
  ok: boolean
  detail?: string
}

export interface AtsReport {
  score: number
  keywords: (AtsKeyword & { found: boolean })[]
  checks: AtsCheck[]
}

const WEAK_OPENERS = /^(responsible for|duties (included|include)|helped( with)?|worked on|assisted( with)?|tasked with|in charge of)\b/i
const FIRST_PERSON = /\b(I|I'm|I've|[Mm]e|[Mm]y)\b/
const HAS_NUMBER = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|dozen|hundred|thousand|million|billion)\b/i
const ODD_CHARS = /[☀-➿\u{1F300}-\u{1FAFF}★☆✓✔➤►▪■◆●]/u

export function resumeText(r: ResumeContent): string {
  return [
    r.name, r.headline, r.summary,
    ...r.skills.flatMap((s) => [s.category, ...s.items]),
    ...r.experience.flatMap((e) => [e.title, e.company, ...e.bullets]),
    ...r.projects.flatMap((p) => [p.name, p.description]),
    ...r.education.flatMap((e) => [e.degree, e.school, e.details]),
    ...r.certifications,
  ].join('\n')
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Matches the term as a whole phrase, ignoring case and allowing "-", "/" or
// spaces between words. "SQL" won't match inside "PostgreSQL" this way, which
// mirrors how most ATS keyword searches behave.
export function containsTerm(text: string, term: string): boolean {
  const words = term.trim().split(/[\s\-/]+/).filter(Boolean).map(escapeRe)
  if (!words.length) return false
  // An acronym in parentheses, e.g. "Search Engine Optimization (SEO)", counts if either half is present.
  const paren = term.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (paren) return containsTerm(text, paren[1]) || containsTerm(text, paren[2])
  const re = new RegExp(`(^|[^\\w+#])${words.join('[\\s\\-/]+')}(?=$|[^\\w+#])`, 'i')
  return re.test(text)
}

export function checkResume(r: ResumeContent, keywords: AtsKeyword[] = []): AtsReport {
  const text = resumeText(r)
  const found = keywords.map((k) => ({ ...k, found: containsTerm(text, k.term) }))
  const bullets = r.experience.flatMap((e) => e.bullets).filter((b) => b.trim())
  const words = text.split(/\s+/).filter(Boolean).length
  const withNumbers = bullets.filter((b) => HAS_NUMBER.test(b)).length
  const weak = bullets.filter((b) => WEAK_OPENERS.test(b.trim()))
  const long = bullets.filter((b) => b.split(/\s+/).length > 40)
  const prose = [r.summary, ...bullets].join('\n')

  const checks: AtsCheck[] = [
    {
      label: 'Contact details in the body',
      ok: Boolean(r.contact.email && r.contact.phone),
      detail: !r.contact.email ? 'Add an email address.' : !r.contact.phone ? 'Add a phone number.' : undefined,
    },
    {
      label: 'Searchable job title as headline',
      ok: Boolean(r.headline.trim()) && r.headline.split(/\s+/).length <= 14,
      detail: !r.headline.trim() ? 'Add a headline with the title you are applying for.' : 'Keep the headline short: a title plus a few specialties.',
    },
    {
      label: 'Short summary',
      ok: Boolean(r.summary.trim()) && r.summary.split(/\s+/).length <= 90,
      detail: !r.summary.trim() ? 'Add a 2-4 sentence summary.' : 'Trim the summary to 2-4 sentences.',
    },
    {
      label: 'Skills section',
      ok: r.skills.some((s) => s.items.length > 0),
      detail: 'Add a skills section; ATS keyword searches lean on it.',
    },
    {
      label: 'Results with numbers',
      ok: bullets.length === 0 || withNumbers / bullets.length >= 0.4,
      detail: `${withNumbers} of ${bullets.length} bullets have a number. Aim for at least 40%.`,
    },
    {
      label: 'Bullets lead with action verbs',
      ok: weak.length === 0,
      detail: weak.length ? `Reword: "${weak[0].slice(0, 50)}…"` : undefined,
    },
    {
      label: 'Bullets one to two lines',
      ok: long.length === 0,
      detail: long.length ? `${long.length} bullet${long.length > 1 ? 's are' : ' is'} over 40 words.` : undefined,
    },
    {
      label: 'No first person',
      ok: !FIRST_PERSON.test(prose),
      detail: 'Drop "I" and "my" from the summary and bullets.',
    },
    {
      label: 'Plain characters only',
      ok: !ODD_CHARS.test(text),
      detail: 'Remove emojis and symbols; some ATS turn them into garbage.',
    },
    {
      label: 'One to two pages',
      ok: words <= 900,
      detail: `About ${words} words. Over ~900 runs past two pages.`,
    },
  ]

  const checkScore = checks.filter((c) => c.ok).length / checks.length
  let score: number
  if (found.length) {
    const weight = { required: 3, preferred: 2, bonus: 1 }
    const total = found.reduce((n, k) => n + weight[k.importance], 0)
    const hit = found.filter((k) => k.found).reduce((n, k) => n + weight[k.importance], 0)
    score = Math.round(100 * (0.7 * (hit / total) + 0.3 * checkScore))
  } else {
    score = Math.round(100 * checkScore)
  }
  return { score, keywords: found, checks }
}
