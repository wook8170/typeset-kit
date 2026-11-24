// PDF 검사 규칙 — inspectPdf 가 읽은 값을 받아 문제 목록을 돌려주는 순수 함수 모음. 규칙 하나에 함수 하나다.
// 부르는 곳: check/index.mjs.
// 먼저 읽을 파일: docs/contract.md 「check 의 결과」, pdf/inspect.mjs(받는 값의 꼴).

export const DEFAULT_TOC_TITLES = ['목차', '차례', 'Contents', 'Table of Contents']
export const DEFAULT_MAX_OUTLINE_DEPTH = 2
const BYTES_PER_MB = 1024 * 1024

const normalize = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase()

/** 책갈피에서 차례 항목(맨 위 단계에서 차례 이름과 같은 것)의 위치. 없으면 -1. */
export function findTocIndex(outline, tocTitles = DEFAULT_TOC_TITLES) {
  const wanted = tocTitles.map(normalize)
  return outline.findIndex((item) => item.depth === 0 && wanted.includes(normalize(item.title)))
}

/**
 * 차례 쪽 범위와 차례 줄을 찾는다. 차례 줄 = 차례 쪽들 안에서 본문 쪽으로 가는 내부 링크(위에서 아래 순서).
 * 본문 첫 쪽은 책갈피에서 차례 항목 뒤 첫 항목의 쪽이다. 차례 항목이 없으면 null.
 */
export function findToc(info, tocTitles) {
  const tocIndex = findTocIndex(info.outline, tocTitles)
  if (tocIndex < 0) return null
  const tocPage = info.outline[tocIndex].page
  const entries = info.outline.slice(tocIndex + 1)
  const bodyStart = entries.find((item) => item.page > tocPage)?.page
  if (bodyStart === undefined) return { tocPage, bodyStart: null, entries, lines: [] }
  const lines = info.links
    .filter((link) => !link.external && link.pageIndex >= tocPage && link.pageIndex < bodyStart && link.page >= bodyStart)
    .sort((left, right) => left.pageIndex - right.pageIndex || right.rect[3] - left.rect[3])
  return { tocPage, bodyStart, entries, lines }
}

export function checkPageMode(info) {
  return info.pageMode === '/UseOutlines' ? [] : ['page-mode: the viewer does not open the bookmark pane (PageMode is not UseOutlines)']
}

export function checkBookmarks(info, { maxOutlineDepth = DEFAULT_MAX_OUTLINE_DEPTH } = {}) {
  if (info.outline.length === 0) return ['no-bookmarks: the PDF has no bookmarks']
  const problems = []
  const depth = Math.max(...info.outline.map((item) => item.depth)) + 1
  if (depth > maxOutlineDepth) problems.push(`bookmark-depth: ${depth} levels, at most ${maxOutlineDepth} allowed`)
  const lost = info.outline.filter((item) => item.page < 0)
  if (lost.length > 0) problems.push(`bookmark-target: ${lost.length} bookmarks point to no page (first: ${lost[0].title})`)
  return problems
}

export function checkLinks(info) {
  const lost = info.links.filter((link) => !link.external && link.page < 0)
  return lost.length === 0 ? [] : [`dead-links: ${lost.length} internal links point to no page (first on page ${lost[0].pageIndex + 1})`]
}

/**
 * 차례 줄 수 = 책갈피 수, 줄마다 책갈피와 같은 쪽으로 가는지, 목적지 쪽이 줄어들지 않는지 본다.
 * 차례가 없는 PDF(쪽 HTML 로 만든 브로셔 등)는 건너뛴다. requireToc 를 주면 차례가 없는 것을 문제로 본다.
 */
export function checkToc(toc, { requireToc = false } = {}) {
  if (!toc) return requireToc ? ['toc-missing: no bookmark named as a table of contents was found'] : []
  if (toc.bodyStart === null) return ['toc-body: no bookmark follows the table of contents']
  if (toc.lines.length !== toc.entries.length) {
    return [`toc-count: ${toc.lines.length} table of contents links, ${toc.entries.length} bookmarks`]
  }
  const problems = []
  toc.lines.forEach((line, index) => {
    const entry = toc.entries[index]
    if (line.page !== entry.page) {
      problems.push(`toc-target: "${entry.title}" bookmark opens page ${entry.page + 1}, its table of contents link opens page ${line.page + 1}`)
    }
    if (index > 0 && line.page < toc.lines[index - 1].page) {
      problems.push(`toc-order: "${entry.title}" comes before the previous line's page`)
    }
  })
  return problems
}

/** 차례가 있는 문서는 쪽 번호 표기가 있어야 하고, 본문 첫 쪽의 표기는 1 이어야 한다. */
export function checkPageLabels(info, toc) {
  if (!toc) return []
  if (!info.pageLabels) return ['page-labels: the PDF has a table of contents but no page label ranges']
  if (toc.bodyStart === null) return []
  const label = info.pageLabels[toc.bodyStart]
  return label === '1' ? [] : [`page-labels: the first body page is labeled "${label}", expected "1"`]
}

export function checkFonts(info, { allowType3 = false } = {}) {
  if (allowType3 || info.type3Fonts === 0) return []
  return [`type3-fonts: ${info.type3Fonts} Type 3 fonts (a system font was embedded as bitmap glyphs; use a font file)`]
}

export function checkSize(info, maxMb) {
  if (!maxMb || info.bytes <= maxMb * BYTES_PER_MB) return []
  return [`pdf-size: ${(info.bytes / BYTES_PER_MB).toFixed(1)} MB is over the ${maxMb} MB limit`]
}

const labelShape = (label) => (/^[ivxlcdm]+$/.test(label) ? 'roman' : label.replace(/\d+/g, '#'))

/** 쪽 번호 표기를 같은 모양끼리 묶어 짧게 적는다. 예: ['표지', 'i-iv', '1-120']. 표기가 없으면 null. */
export function summarizeLabels(labels) {
  if (!labels) return null
  const groups = []
  for (const label of labels) {
    const last = groups[groups.length - 1]
    if (last && last.shape === labelShape(label) && last.shape !== label) last.end = label
    else groups.push({ shape: labelShape(label), start: label, end: label })
  }
  return groups.map((group) => (group.start === group.end ? group.start : `${group.start}-${group.end}`))
}
