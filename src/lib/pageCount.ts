import { createElement, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ResumeDocument from '../components/ResumeDocument'
import type { ResumeContent, ResumeFormat } from '../types'

// Printed page area: US letter with the 0.5in margins set in styles.css @page.
const PAGE_WIDTH = '7.5in'
const PAGE_HEIGHT_PX = 10 * 96

// Estimates how many printed pages a resume takes by laying it out offscreen
// at print width with print styling, then laying its blocks onto pages the way
// the browser's print does (job entries are kept whole, see .entry in styles.css).
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
      const article = host.querySelector('.resume')
      if (!cancelled && article) setPages(paginate(article))
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

// Blocks that print as one unit, in document order.
function atoms(article: Element): Element[] {
  const out: Element[] = []
  for (const child of Array.from(article.children)) {
    if (child.tagName !== 'SECTION') {
      out.push(child)
      continue
    }
    for (const block of Array.from(child.children)) {
      if (block.tagName === 'UL') out.push(...Array.from(block.children))
      else out.push(block)
    }
  }
  return out
}

function paginate(article: Element): number {
  const top = article.getBoundingClientRect().top
  const blocks = atoms(article)
  let page = 0
  let pageStart = 0 // where the current page begins, in the unpaginated layout
  let shift = 0 // how far later blocks move down because of earlier page breaks
  for (const block of blocks) {
    const rect = block.getBoundingClientRect()
    const start = rect.top - top + shift
    const end = rect.bottom - top + shift
    const pageEnd = pageStart + PAGE_HEIGHT_PX
    if (end > pageEnd) {
      const fitsWhole = rect.height <= PAGE_HEIGHT_PX
      page += 1
      if (fitsWhole && start > pageStart) {
        // the block moves to the top of the next page
        shift += pageEnd - start
        pageStart = pageEnd
      } else {
        pageStart = pageEnd
      }
    }
  }
  const last = blocks[blocks.length - 1]
  const bottom = last ? last.getBoundingClientRect().bottom - top + shift : 0
  return page + Math.max(0, bottom - pageStart) / PAGE_HEIGHT_PX
}
