// Builds a Word (.docx) copy of a resume. Many ATS parse .docx more reliably
// than PDF, so this uses a plain single-column layout: standard fonts, real
// bullet lists, no tables, text boxes, headers or footers.
import type { Paragraph as DocParagraph, TextRun as DocRun } from 'docx'
import type { ResumeContent } from '../types'

export async function downloadDocx(r: ResumeContent, filename: string) {
  const { AlignmentType, BorderStyle, Document, Packer, Paragraph, TabStopType, TextRun } = await import('docx')

  const font = 'Calibri'
  const heading = (text: string) =>
    new Paragraph({
      spacing: { before: 200, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } },
      children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, font })],
    })
  const line = (runs: DocRun[], extra: Record<string, unknown> = {}) =>
    new Paragraph({ spacing: { after: 40 }, children: runs, ...extra })
  const bullet = (text: string) =>
    new Paragraph({ bullet: { level: 0 }, spacing: { after: 30 }, children: [new TextRun({ text, size: 21, font })] })
  const t = (text: string, opts: { bold?: boolean; italics?: boolean } = {}) => new TextRun({ text, size: 21, font, ...opts })
  // Title on the left, dates on the right edge, using a tab stop rather than a table.
  const entryHead = (left: DocRun[], right: string) =>
    line([...left, ...(right ? [new TextRun({ text: `\t${right}`, size: 21, font })] : [])], {
      tabStops: [{ type: TabStopType.RIGHT, position: 10080 }],
    })

  const contact = [r.contact.email, r.contact.phone, r.contact.location, ...r.contact.links].filter(Boolean).join(' | ')
  const body: DocParagraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r.name, bold: true, size: 36, font })] }),
  ]
  if (r.headline) body.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [t(r.headline)] }))
  if (contact) body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [t(contact)] }))

  if (r.summary) body.push(heading('Professional Summary'), line([t(r.summary)]))
  if (r.skills.length) {
    body.push(heading('Skills'))
    for (const s of r.skills) body.push(line([...(s.category ? [t(`${s.category}: `, { bold: true })] : []), t(s.items.join(', '))]))
  }
  if (r.experience.length) {
    body.push(heading('Work Experience'))
    for (const e of r.experience) {
      body.push(entryHead([t(e.title, { bold: true }), t([e.company, e.location].filter(Boolean).map((x) => `, ${x}`).join(''))], [e.start, e.end].filter(Boolean).join(' - ')))
      for (const b of e.bullets) body.push(bullet(b))
    }
  }
  if (r.projects.length) {
    body.push(heading('Projects'))
    for (const p of r.projects) body.push(line([t(p.name, { bold: true }), ...(p.description ? [t(`: ${p.description}`)] : [])]))
  }
  if (r.education.length) {
    body.push(heading('Education'))
    for (const e of r.education) {
      body.push(entryHead([t(e.degree, { bold: true }), ...(e.school ? [t(`, ${e.school}`)] : [])], e.year))
      if (e.details) body.push(line([t(e.details)]))
    }
  }
  if (r.certifications.length) {
    body.push(heading('Certifications'))
    for (const c of r.certifications) body.push(bullet(c))
  }

  const doc = new Document({
    creator: r.name,
    title: `${r.name} Resume`,
    sections: [{ properties: { page: { margin: { top: 1008, bottom: 1008, left: 1080, right: 1080 } } }, children: body }],
  })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
