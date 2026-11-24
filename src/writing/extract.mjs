// 대상 글 뽑기 — 원고 종류(Markdown · 책 명세 · 쪽 HTML)마다 독자에게 나가는 글만 줄 목록 [{ line, text }] 로 뽑는다.
// 부르는 곳: writing/index.mjs. 순수 함수이며 줄 번호는 원본 파일 기준 1부터다.
// 먼저 읽을 파일: docs/contract.md 「블록 계약」(책 명세의 어느 필드가 글인가).

import { isComment, markdown, plainText } from '../input/markdown-inline.mjs'
import { toLf } from '../platform.mjs'

const blank = (match) => match.replace(/[^\n]/g, ' ')

/** 줄 번호를 지키려고 지울 구간을 같은 개수의 줄바꿈만 남기고 공백으로 바꾼다. */
const blankOut = (text, pattern) => text.replace(pattern, blank)

const toLines = (text, firstLine = 1) => text.split(/\r?\n/).map((lineText, index) => ({ line: firstLine + index, text: lineText }))

/**
 * 이어진 글 줄들을 한 덩어리로 잇는다. 돌려주는 값 = { line, text, breaks } — text 는 줄을 띄어쓰기로 이은 글이고,
 * breaks([{ at, line }])는 text 의 몇 번째 글자부터가 원본의 몇 번째 줄인지다.
 * 조판은 문단의 줄바꿈을 띄어쓰기로 바꿔 싣는다. 그래서 줄 경계에 걸친 표현도 찾으려면 이어서 봐야 한다.
 * 줄 안의 공백 뭉치(지운 태그 자리 등)는 한 칸으로 줄인다.
 */
export function joinLines(entries) {
  const breaks = []
  let text = ''
  for (const entry of entries) {
    const piece = entry.text.replace(/\s+/g, ' ').trim()
    if (!piece) continue
    if (text) text += ' '
    breaks.push({ at: text.length, line: entry.line })
    text += piece
  }
  return { line: breaks[0]?.line ?? entries[0]?.line ?? 0, text, breaks }
}

/** 빈 줄로 나뉜 글 줄 묶음마다 한 덩어리로 잇는다. */
function joinRuns(lines) {
  const runs = []
  let run = []
  for (const entry of [...lines, { text: '' }]) {
    if (entry.text.trim()) run.push(entry)
    else if (run.length) {
      runs.push(joinLines(run))
      run = []
    }
  }
  return runs
}

/** 인라인 토큰들의 글. 인라인 코드와 HTML 주석은 빼고, 꾸밈(굵게 · 링크 등)은 안쪽 글만 남긴다. 작성자가 쓴 HTML 은 PDF 에 글자로 보이므로 남긴다. */
function inlineText(tokens) {
  return tokens
    .map((token) => {
      if (token.type === 'codespan') return ''
      if (token.type === 'html') return isComment(token.text) ? '' : token.text
      if (token.type === 'br') return '\n'
      // 그림의 제목 자리 글은 캡션으로 실린다. 대체 글과 함께 본다.
      if (token.type === 'image') return [plainText(token.tokens ?? []) || token.text, token.title].filter(Boolean).join(' ')
      return token.tokens ? inlineText(token.tokens) : (token.text ?? '')
    })
    .join('')
}

/** 표의 칸들(머리 행 + 본문 행)을 글 덩어리로 바꾼다. 찾을 원문은 칸의 글이다. */
const tableChunks = (table) => [table.header, ...table.rows].flat().map((cell) => ({ raw: cell.text, text: inlineText(cell.tokens) }))

/**
 * 블록 토큰 하나에서 글 덩어리 [{ raw, text }] 를 뽑는다. raw 는 줄 번호를 찾는 데 쓰는 원문이고 text 는 검사할 글이다.
 * 코드 블록과 HTML 주석은 건너뛴다. 목록 · 인용문은 안쪽 블록까지 내려간다. 굽기가 토큰 나무로 본문을 만들기 때문에
 * 검사도 같은 나무를 끝까지 따라가야 빠지는 글이 없다.
 */
function proseChunks(token) {
  if (token.type === 'code' || token.type === 'space' || token.type === 'hr' || token.type === 'def') return []
  if (token.type === 'html') return isComment(token.text) ? [] : [{ raw: token.raw, text: token.text }]
  if (token.type === 'table') return tableChunks(token)
  if (token.type === 'list') return token.items.flatMap((item) => item.tokens.flatMap(proseChunks))
  if (token.type === 'blockquote') return token.tokens.flatMap(proseChunks)
  // 제목은 조판이 꾸밈 없는 글로 싣는다(인라인 코드는 글자로, 태그는 뺀다). 검사도 같은 글을 본다.
  if (token.type === 'heading') return [{ raw: token.raw, text: plainText(token.tokens) }]
  return [{ raw: token.raw, text: token.tokens ? inlineText(token.tokens) : (token.text ?? '') }]
}

/**
 * 글 덩어리의 줄마다 원본 줄 번호를 붙인다. 덩어리 원문의 줄을 블록 원문에서 차례로 찾아 번호를 정한다.
 * 목록 안 글처럼 들여쓰기가 빠진 줄은 앞뒤 공백을 떼고 찾는다. 못 찾은 줄은 바로 앞 줄의 번호를 쓴다.
 */
function numberChunk(chunk, block, cursor) {
  const rawLines = chunk.raw.split('\n').map((line) => line.trim())
  const numbers = []
  for (const rawLine of rawLines) {
    const found = rawLine ? block.lines.findIndex((line, index) => index >= cursor.index && line.includes(rawLine)) : -1
    if (found >= 0) cursor.index = found
    numbers.push(block.firstLine + cursor.index)
  }
  return chunk.text.split('\n').map((text, index) => ({ line: numbers[Math.min(index, numbers.length - 1)], text }))
}

/**
 * Markdown: 독자에게 나가는 글을 덩어리(문단 · 제목 · 목록 항목의 문단 · 표 칸)마다 한 줄로 이어 뽑는다(joinLines).
 * 빈 줄 · 코드 · 주석은 결과에 없다. 인용문은 책의 본문이라 남긴다.
 * 굽기와 같은 읽개(input/markdown-inline.mjs 의 markdown.lexer)의 토큰 나무에서 뽑는다. 두 쪽이 원고를 다르게 읽으면
 * PDF 에 실리는 글이 검사에서 빠지기 때문이다. 파일 머리의 `---` 묶음도 굽기가 본문으로 싣기 때문에 검사한다.
 */
export function extractMarkdown(source) {
  const lines = []
  let firstLine = 1
  for (const token of markdown.lexer(toLf(source))) {
    const block = { firstLine, lines: token.raw.split('\n') }
    const cursor = { index: 0 }
    for (const chunk of proseChunks(token)) lines.push(joinLines(numberChunk(chunk, block, cursor)))
    firstLine += block.lines.length - 1
  }
  return lines.filter((entry) => entry.text !== '')
}

/** 덩어리를 나누는 표시. 블록 태그 자리에 둔다. */
const BOUNDARY = '\u0001'
/** 글 덩어리를 나누는 태그. 이웃한 칸 · 항목 · 제목의 글을 한 문장처럼 잇지 않기 위해 경계로 삼는다. */
const BLOCK_TAG = /<\/?(?:p|div|section|article|header|footer|main|aside|nav|h[1-6]|ul|ol|li|dl|dt|dd|table|thead|tbody|tfoot|tr|td|th|caption|figure|figcaption|blockquote|br|hr)\b[^<>]*>/gi
/** 태그 하나. `<` 바로 뒤가 글자 · `/` · `!` 일 때만 태그다. 글 속의 맨 `<`(예: p < 0.05)는 태그가 아니다. */
const ANY_TAG = /<[A-Za-z/!][^<>]*>/g

/** 줄 하나를 경계 표시에서 나눈다. 경계는 빈 줄 항목으로 남겨 joinRuns 가 덩어리를 끊게 한다. */
function splitAtBoundaries(entry) {
  if (!entry.text.includes(BOUNDARY)) return [entry]
  return entry.text.split(BOUNDARY).flatMap((piece, index) => (index === 0 ? [{ line: entry.line, text: piece }] : [{ line: entry.line, text: '' }, { line: entry.line, text: piece }]))
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }

/** HTML: 주석 · script · style · pre · code · 태그를 뺀다. 엔티티는 글자로 바꾼다. 빈 줄이나 블록 태그로 나뉘지 않은 줄은 한 덩어리로 잇는다. */
export function extractHtml(source, firstLine = 1) {
  let text = blankOut(source, /<!--[\s\S]*?-->/g)
  for (const tag of ['script', 'style', 'pre', 'code']) text = blankOut(text, new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, 'gi'))
  text = text.replace(BLOCK_TAG, (tag) => BOUNDARY + blank(tag).slice(1))
  text = blankOut(text, ANY_TAG).replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity])
  return joinRuns(toLines(text, firstLine).flatMap(splitAtBoundaries))
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
    return extractHtml(value, firstLine).map((entry) => (firstLine === 0 ? { line: 0, text: entry.text } : entry))
  })
}
