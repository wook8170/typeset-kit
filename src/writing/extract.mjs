// 대상 글 뽑기 — 원고 종류(Markdown · 책 명세 · 쪽 HTML)마다 독자에게 나가는 글만 줄 목록 [{ line, text }] 로 뽑는다.
// 부르는 곳: writing/index.mjs. 순수 함수이며 줄 번호는 원본 파일 기준 1부터다.
// 먼저 읽을 파일: docs/contract.md 「블록 계약」(책 명세의 어느 필드가 글인가).

const blank = (match) => match.replace(/[^\n]/g, ' ')

/** 줄 번호를 지키려고 지울 구간을 같은 개수의 줄바꿈만 남기고 공백으로 바꾼다. */
const blankOut = (text, pattern) => text.replace(pattern, blank)

const toLines = (text, firstLine = 1) => text.split(/\r?\n/).map((lineText, index) => ({ line: firstLine + index, text: lineText }))

const FENCE = /^\s*(```|~~~)/

/** 코드 블록(``` · ~~~) 안의 줄을 비운다. 여는 표시와 같은 표시로 닫는다. */
function blankFences(lines) {
  let openFence = null
  return lines.map((entry) => {
    const marker = entry.text.match(FENCE)?.[1]
    if (marker && (openFence === null || marker === openFence)) {
      openFence = openFence === null ? marker : null
      return { ...entry, text: '' }
    }
    return openFence === null ? entry : { ...entry, text: '' }
  })
}

/** 맨 앞의 front matter(--- … ---)를 비운다. */
const blankFrontMatter = (text) => (text.startsWith('---') ? text.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?=\r?\n|$)/, blank) : text)

/** Markdown: front matter · HTML 주석 · 코드 블록 · 인라인 코드를 뺀다. 인용문은 책의 본문이라 남긴다. */
export function extractMarkdown(source) {
  const withoutComments = blankOut(blankFrontMatter(source), /<!--[\s\S]*?-->/g)
  return blankFences(toLines(withoutComments)).map((entry) => ({ ...entry, text: entry.text.replace(/`[^`]*`/g, '') }))
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }

/** HTML: 주석 · script · style · pre · code · 태그를 뺀다. 엔티티는 글자로 바꾼다. */
export function extractHtml(source, firstLine = 1) {
  let text = blankOut(source, /<!--[\s\S]*?-->/g)
  for (const tag of ['script', 'style', 'pre', 'code']) text = blankOut(text, new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, 'gi'))
  text = blankOut(text, /<[^>]*>/g).replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity])
  return toLines(text, firstLine)
}

/** 글이 아닌 필드. 값이 이름표 · 경로 · 숫자 · 코드라서 글쓰기 규칙을 적용하지 않는다. */
const NON_PROSE_KEYS = new Set([
  't', 'id', 'no', 'num', 'kind', 'mono', 'src', 'svgText', 'hue', 'widths', 'lines', 'code', 'px', 'fit', 'marks',
  'span', 'align', 'strong', 'land', 'compact', 'start', 'inline', 'maxh', 'anchor', 'edition', 'issued',
])

/** 책 명세 안의 글 문자열을 모두 모은다. 문자열은 인라인 HTML 일 수 있어 extractHtml 로 한 번 더 거른다. */
export function collectSpecStrings(node, key = '') {
  if (typeof node === 'string') return key && NON_PROSE_KEYS.has(key) ? [] : [node]
  if (Array.isArray(node)) return node.flatMap((item) => collectSpecStrings(item, key))
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([name, value]) => (NON_PROSE_KEYS.has(name) ? [] : collectSpecStrings(value, name)))
  return []
}

/** 문자열의 첫 줄이 원본 파일의 몇 번째 줄에 있는지(없으면 0). 원본에 이스케이프가 있으면 못 찾을 수 있다. */
function locateLine(sourceText, value) {
  const needle = value.split('\n')[0].slice(0, 40)
  const index = needle ? sourceText.indexOf(needle) : -1
  return index === -1 ? 0 : sourceText.slice(0, index).split('\n').length
}

/** 책 명세(객체): 글 필드의 문자열마다 줄 목록을 뽑는다. sourceText 는 줄 번호를 찾는 데만 쓴다. */
export function extractSpec(spec, sourceText = '') {
  return collectSpecStrings(spec).flatMap((value) => {
    const firstLine = locateLine(sourceText, value)
    return extractHtml(value, firstLine).map((entry) => ({ ...entry, line: firstLine === 0 ? 0 : entry.line }))
  })
}
