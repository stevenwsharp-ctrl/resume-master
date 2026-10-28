import { createElement, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ResumeDocument from '../components/ResumeDocument'
import type { ResumeContent, ResumeFormat } from '../types'

// Printed page area: US letter with the 0.5in margins set in styles.css @page.
const PAGE_WIDTH = '7.5in'
const PAGE_HEIGHT_PX = 10 * 96

// Estimates how many printed pages a resume takes by laying it out offscreen
// at print width with print styling. Good to about a tenth of a page.
export function usePageCount(content: ResumeContent | null, format: ResumeFormat): number | null {
  const [pages, setPages] = useState<number | null>(null)

  useEffect(() => {
    if (!content) return
    const host = document.createElement('div')
    host.className = 'page-measure'
    host.style.width = PAGE_WIDTH
    host.setAttribute('aria-hidden', 'true')
    document.body.appendChild(host)
    const root = createRoot(host)
    let cancelled = false
    const measure = () => {
      if (!cancelled) setPages(host.scrollHeight / PAGE_HEIGHT_PX)
    }
    root.render(createElement(ResumeDocument, { resume: content, format }))
    setTimeout(measure, 60)
    // Web fonts change line wrapping, so measure again once they've loaded.
    document.fonts?.ready.then(() => setTimeout(measure, 60))
    return () => {
      cancelled = true
      setTimeout(() => {
        root.unmount()
        host.remove()
      })
    }
  }, [content, format])

  return pages
}
