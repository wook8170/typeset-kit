// 그대로 넣는 SVG 의 허용 목록 검사 — 그림에 스크립트 · 다른 문서 · 바깥 자원이 섞이면 조판 전에 실패로 판정한다.
// 부르는 곳: modes/spec.mjs(조판 전에 그림마다 부른다), 공개 진입점 `typeset-kit/render`.
// 먼저 읽을 파일: render/csp.mjs(문서 정책으로 한 번 더 막는다).
//
// 그대로 넣은 SVG 는 조판 브라우저 안에서 문서의 일부로 해석된다. 그래서 문자열 검색이 아니라 엄격한 XML 읽기로 읽고,
// 허용 목록 밖의 요소 · 속성이 하나라도 있으면 실패로 판정한다. 고쳐서 넣지 않는다(결과를 결정적으로 두기 위해서다).
//
// 읽기 규칙(XML 과 HTML 의 해석 차이를 없애려고 좁게 받는다)
//   - 요소 · 속성 이름은 대소문자까지 목록과 같아야 한다. 이름공간 접두어(`svg:script` · `xlink:href`)는 목록에 없다.
//   - CDATA · DOCTYPE · 처리 명령은 받지 않는다. 뿌리 요소는 `svg` 하나다.
//   - 주석은 XML 과 HTML 이 같은 범위로 읽는 꼴(`<!--` 바로 뒤가 `>` · `->` 가 아니고, 안에 `--` 가 없음)만 받는다.
//   - 같은 속성이 두 번 나오면 두 값을 모두 검사한다. 두 값이 모두 목록을 지나면 어느 쪽으로 읽어도 결과가 같다.
//   - 문자 참조는 XML 기본 다섯 개와 숫자 참조만 받는다. 값 검사는 참조를 푼 뒤에 한다.
//   - 속성 값의 `url(` 은 `#` 로 시작하는 문서 안 참조만 받는다. 값에 역빗금(CSS 이스케이프)이 있으면 실패다.

/** 허용 요소. `image` 는 `href` 가 그림 data 주소일 때만 받는다(checkValue). */
export const SVG_ELEMENTS = Object.freeze([
  'svg', 'g', 'defs', 'marker', 'path', 'rect', 'line', 'polygon', 'circle', 'text', 'tspan',
  'ellipse', 'image',
])

/**
 * 허용 속성 — 좌표 · 크기 · 색 · 선 · 글꼴 · 식별 · 접근성. `on*` · `xlink:href` 는 넣지 않는다.
 * `href` 는 `image` 요소에서 PNG · JPEG · WebP data 주소일 때만 받는다. 그림 파일을 data 주소로 바꾼 뒤에 검사하므로,
 * 파일 경로가 남은 `href` 는 실패한다.
 */
export const SVG_ATTRS = Object.freeze([
  // 뿌리 · 식별 · 접근성
  'xmlns', 'viewBox', 'width', 'height', 'id', 'role', 'aria-label', 'aria-hidden', 'style', 'data-minfont',
  // 좌표 · 모양
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'dx', 'dy', 'transform',
  // 표식
  'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'markerUnits', 'marker-end', 'marker-start',
  // 그림
  'href', 'preserveAspectRatio',
  // 색 · 선
  'fill', 'fill-opacity', 'opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
  'stroke-linejoin', 'stroke-opacity', 'paint-order',
  // 글꼴 · 글자 배치
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing',
])

/** 더해도 허용 목록이 받지 않는 이름. 스크립트 · 다른 문서를 부르는 요소와 이벤트 속성이다. */
const NEVER_ELEMENTS = new Set(['script', 'foreignObject', 'iframe', 'object', 'embed', 'use', 'a', 'style', 'link', 'meta', 'base'])
const isEventAttr = (name) => /^on/i.test(name) || name.includes(':')

const SVG_NS = 'http://www.w3.org/2000/svg'
const IMAGE_DATA = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/
const NAMED_REFS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/
// 문자열을 그림으로 부를 수 있는 CSS 함수 — `url(` 말고도 따옴표 문자열로 자원을 부른다.
const LOADERS = /(?:image-set|image|cross-fade|element)\s*\(|@import/i

class SvgReject extends Error {}
const reject = (message) => {
  throw new SvgReject(message)
}

/**
 * 허용 목록 한 벌(순수 함수). extra = { elements, attrs } 로 더한다.
 * 스크립트를 부르는 요소와 이벤트 · 이름공간 속성은 더해도 받지 않는다.
 */
export function svgAllowList({ elements = [], attrs = [] } = {}) {
  const badElement = elements.find((name) => NEVER_ELEMENTS.has(name))
  if (badElement) throw new Error(`SVG allow list cannot include element "${badElement}"`)
  const badAttr = attrs.find(isEventAttr)
  if (badAttr) throw new Error(`SVG allow list cannot include attribute "${badAttr}"`)
  return { elements: new Set([...SVG_ELEMENTS, ...elements]), attrs: new Set([...SVG_ATTRS, ...attrs]) }
}

const DEFAULT_ALLOW = svgAllowList()

/** 문자 참조를 푼다. 목록 밖 이름 참조 · 닫히지 않은 참조는 실패. */
function decodeRefs(value, where) {
  return value.replace(/&([^;]*);?/g, (match, body) => {
    if (!match.endsWith(';')) reject(`${where}: unterminated character reference "${match}"`)
    if (body in NAMED_REFS) return NAMED_REFS[body]
    const digits = /^#(?:x([0-9a-fA-F]{1,6})|([0-9]{1,7}))$/.exec(body)
    if (!digits) reject(`${where}: character reference not allowed "${match}"`)
    const codePoint = digits[1] ? parseInt(digits[1], 16) : parseInt(digits[2], 10)
    if (codePoint > 0x10ffff) reject(`${where}: character reference out of range "${match}"`)
    return String.fromCodePoint(codePoint)
  })
}

/** 속성 값 검사(참조를 푼 값). */
function checkValue(element, name, raw) {
  const where = `<${element} ${name}>`
  const value = decodeRefs(raw, where)
  if (name === 'xmlns' && value !== SVG_NS) reject(`${where}: not the SVG namespace`)
  if (name === 'href') {
    if (element !== 'image') reject(`${where}: href is allowed only on image elements`)
    if (!IMAGE_DATA.test(value)) reject(`${where}: href is not an image data URI`)
    return
  }
  if (name === 'aria-label') return
  if (value.includes('\\')) reject(`${where}: backslash (CSS escape) in value`)
  if (LOADERS.test(value)) reject(`${where}: CSS function that loads a resource`)
  for (const match of value.matchAll(/url\s*\(\s*(['"]?)\s*(.?)/gi)) {
    if (match[2] !== '#') reject(`${where}: url( reference outside the document`)
  }
}

/** 여는 태그의 속성들을 읽는다. 돌려주는 값 = 태그 끝 위치 · 빈 요소 여부. */
function readAttrs(source, start, element, allow) {
  let at = start
  for (;;) {
    const spaces = /^\s*/.exec(source.slice(at))[0].length
    at += spaces
    if (source.startsWith('/>', at)) return { end: at + 2, isEmpty: true }
    if (source[at] === '>') return { end: at + 1, isEmpty: false }
    if (!spaces) reject(`<${element}>: no space between attributes`)
    const name = NAME.exec(source.slice(at))?.[0]
    if (!name) reject(`<${element}>: unreadable attribute name`)
    if (!allow.attrs.has(name)) reject(`<${element}>: attribute not in the allow list "${name}"`)
    at += name.length
    const equals = /^\s*=\s*(["'])/.exec(source.slice(at))
    if (!equals) reject(`<${element} ${name}>: value is not quoted`)
    at += equals[0].length
    const close = source.indexOf(equals[1], at)
    if (close < 0) reject(`<${element} ${name}>: value is not closed`)
    const raw = source.slice(at, close)
    if (raw.includes('<')) reject(`<${element} ${name}>: "<" in value`)
    checkValue(element, name, raw)
    at = close + 1
  }
}

/** 주석을 건너뛴다. XML 과 HTML 이 주석 끝을 다르게 볼 수 있는 꼴은 실패. */
function skipComment(source, at) {
  const end = source.indexOf('-->', at + 4)
  if (end < 0) reject('comment is not closed')
  const body = source.slice(at + 4, end)
  if (body.startsWith('>') || body.startsWith('->') || body.includes('--') || body.endsWith('-') || body.includes('--!>')) {
    reject('comment form not allowed')
  }
  return end + 3
}

/** 닫는 태그를 읽는다. 여는 태그와 짝이 맞아야 한다. */
function readCloseTag(source, at, stack) {
  const match = /^<\/([A-Za-z_][A-Za-z0-9_.:-]*)\s*>/.exec(source.slice(at))
  if (!match) reject('unreadable closing tag')
  if (stack.at(-1) !== match[1]) reject(`closing tag </${match[1]}> does not match the open tag`)
  stack.pop()
  return at + match[0].length
}

/** 태그 하나(`<` 위치에서 시작)를 읽고 다음 위치를 돌려준다. */
function readTag(source, at, state) {
  if (source.startsWith('<!--', at)) return skipComment(source, at)
  if (source.startsWith('<!', at)) reject('CDATA and DOCTYPE are not allowed')
  if (source.startsWith('<?', at)) reject('processing instructions are not allowed')
  if (source[at + 1] === '/') return readCloseTag(source, at, state.stack)
  const element = NAME.exec(source.slice(at + 1))?.[0]
  if (!element) reject('unreadable element name')
  if (!state.allow.elements.has(element)) reject(`element not in the allow list "${element}"`)
  if (state.stack.length === 0) {
    if (state.roots++) reject('more than one root element')
    if (element !== 'svg') reject(`root element is not svg "${element}"`)
  }
  const { end, isEmpty } = readAttrs(source, at + 1 + element.length, element, state.allow)
  if (!isEmpty) state.stack.push(element)
  return end
}

/** SVG 문자열을 검사해 문제 하나(영어 문장)를 돌려준다. 문제가 없으면 null. allow 는 svgAllowList() 의 결과다. */
export function svgProblem(svg, allow = DEFAULT_ALLOW) {
  try {
    if (typeof svg !== 'string') reject('SVG is not a string')
    const source = svg.replace(/^﻿/, '')
    const state = { stack: [], roots: 0, allow }
    let at = 0
    while (at < source.length) {
      const lt = source.indexOf('<', at)
      const text = source.slice(at, lt < 0 ? source.length : lt)
      if (state.stack.length === 0 && text.trim()) reject('text outside the root element')
      decodeRefs(text, 'text')
      if (lt < 0) break
      at = readTag(source, lt, state)
    }
    if (!state.roots) reject('no elements')
    if (state.stack.length) reject(`element <${state.stack.at(-1)}> is not closed`)
    return null
  } catch (error) {
    if (error instanceof SvgReject) return error.message
    throw error
  }
}

/** 검사에 걸리면 그림 이름을 붙여 오류를 던진다. */
export function assertSafeSvg(svg, label, allow = DEFAULT_ALLOW) {
  const problem = svgProblem(svg, allow)
  if (problem) throw new Error(`SVG check failed (${label}): ${problem}`)
}
