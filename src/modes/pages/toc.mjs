// 차례 면 만들기 — 면(원고)마다 한 줄씩 적은 차례 HTML 과, 줄마다 누르면 그 면으로 가는 링크 영역을 만든다.
// 부르는 곳: modes/pages.mjs.
// 먼저 읽을 파일: pdf/nav.mjs(링크 영역을 PDF 에 쓰는 쪽).
import { escapeHtml } from './template.mjs'

/** 차례 면의 모양(CSS 픽셀, 96dpi A4 = 794 x 1123). 줄 위치를 고정해서 링크 영역을 계산할 수 있다. */
export const TOC_LAYOUT = Object.freeze({
  pageWidth: 794,
  pageHeight: 1123,
  left: 72,
  width: 650,
  firstRowTop: 170,
  rowHeight: 30,
  rowsPerPage: 28,
})

const PIXEL_TO_POINT = 0.75
export const A4_HEIGHT_POINT = 841.89

/** 차례 줄 수에 따른 차례 쪽 수. */
export function tocPageCount(entryCount) {
  return Math.max(1, Math.ceil(entryCount / TOC_LAYOUT.rowsPerPage))
}

function rowTop(index) {
  return TOC_LAYOUT.firstRowTop + (index % TOC_LAYOUT.rowsPerPage) * TOC_LAYOUT.rowHeight
}

function rowHtml(entry, index) {
  const indent = entry.depth * 20
  return (
    `<div class="row" style="top:${rowTop(index)}px;padding-left:${indent}px">` +
    `<span class="title">${escapeHtml(entry.title)}</span><span class="dots"></span><span class="num">${entry.number}</span></div>`
  )
}

function sheetHtml(entries, sheetIndex, heading) {
  const first = sheetIndex * TOC_LAYOUT.rowsPerPage
  const rows = entries.slice(first, first + TOC_LAYOUT.rowsPerPage).map((entry, offset) => rowHtml(entry, first + offset))
  return `<section class="sheet">${sheetIndex === 0 ? `<h1>${escapeHtml(heading)}</h1>` : ''}${rows.join('')}</section>`
}

const tocCss = (family) => `
@page { size: A4; margin: 0 }
html, body { margin: 0; padding: 0 }
body { font-family: ${family}; color: #1a1a1a }
.sheet { position: relative; width: ${TOC_LAYOUT.pageWidth}px; height: ${TOC_LAYOUT.pageHeight}px; overflow: hidden; break-after: page }
.sheet:last-child { break-after: auto }
h1 { position: absolute; left: ${TOC_LAYOUT.left}px; top: 80px; margin: 0; font-size: 28px; font-weight: 700 }
.row { position: absolute; left: ${TOC_LAYOUT.left}px; width: ${TOC_LAYOUT.width}px; height: ${TOC_LAYOUT.rowHeight}px; box-sizing: border-box;
  display: flex; align-items: baseline; gap: 8px; line-height: ${TOC_LAYOUT.rowHeight}px; font-size: 15px }
.dots { flex: 1; border-bottom: 1px dotted #888; transform: translateY(-5px) }
.num { min-width: 28px; text-align: right }
`

/**
 * 차례 문서 HTML. entries = [{ depth, title, number }]. 쪽마다 같은 줄 높이로 줄이 놓인다.
 * 줄을 누르면 가는 링크는 HTML 이 아니라 PDF 에 따로 쓴다(tocLinks).
 */
export function tocHtml(entries, { heading, family = 'sans-serif', fontCss = '' }) {
  const sheets = Array.from({ length: tocPageCount(entries.length) }, (_, index) => sheetHtml(entries, index, heading))
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(heading)}</title><style>${fontCss}${tocCss(family)}</style></head>` +
    `<body>${sheets.join('')}<script>document.fonts.ready.then(function(){window.__paged=true})</script></body></html>`
  )
}

/**
 * 차례 줄마다 링크 영역을 계산한다(PDF 좌표, 왼쪽 아래 원점). targets[i] 는 i 번째 줄이 가는 합본 쪽(0 부터).
 * 돌려주는 값 = [{ pageIndex, rect, targetPageIndex }]. pageIndex 는 차례가 시작하는 쪽을 0 으로 센다.
 */
export function tocLinks(targets) {
  return targets.map((targetPageIndex, index) => {
    const top = rowTop(index)
    const left = TOC_LAYOUT.left * PIXEL_TO_POINT
    const right = (TOC_LAYOUT.left + TOC_LAYOUT.width) * PIXEL_TO_POINT
    return {
      pageIndex: Math.floor(index / TOC_LAYOUT.rowsPerPage),
      rect: [left, A4_HEIGHT_POINT - (top + TOC_LAYOUT.rowHeight) * PIXEL_TO_POINT, right, A4_HEIGHT_POINT - top * PIXEL_TO_POINT],
      targetPageIndex,
    }
  })
}
