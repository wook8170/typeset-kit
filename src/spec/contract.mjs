// 책 명세 계약 — 렌더가 받는 책 명세(spec)와 블록의 꼴을 선언하고, 들어온 명세가 그 꼴에 맞는지 검사한다. 순수 함수다.
// 부르는 곳: 조판 모드(modes/spec.mjs 가 렌더 전에 부른다), Markdown 변환(input/*)의 테스트, docs/contract.md(사람이 읽는 판).
// 먼저 읽을 파일: docs/contract.md 「블록 계약」.

/** 필드 종류. html = 작성자가 쓴 안전한 인라인 마크업(그대로 넣는다), text = 글자(렌더가 이스케이프한다). */
const html = { type: 'html' }
const plain = { type: 'text' }
const bool = { type: 'boolean' }
const num = { type: 'number' }
const any = { type: 'any' }
const optional = (field) => ({ ...field, isOptional: true })

/** 기본 콜아웃 종류. 설정 theme.callouts 의 키가 여기에 더해진다. */
export const DEFAULT_CALLOUT_KINDS = ['note', 'caution', 'warning']

/** 블록 종류 → 필드. 필드 이름 · 종류를 바꾸려면 이 표와 docs/contract.md 를 함께 고친다. */
export const BLOCK_FIELDS = {
  p: { html },
  lede: { html },
  h3: { text: plain, sub: optional(html) },
  defs: { rows: { type: 'pairs' } },
  steps: { items: { type: 'items' }, label: optional(plain), start: optional(num) },
  ol: { items: { type: 'items' }, label: optional(plain), start: optional(num) },
  ul: { items: { type: 'htmlList' } },
  code: { lines: { type: 'lines' } },
  table: {
    rows: { type: 'rows' },
    head: optional({ type: 'cells' }),
    widths: optional({ type: 'textList' }),
    caption: optional(html),
    num: optional(plain),
    land: optional(bool),
    compact: optional(bool),
  },
  callout: { kind: plain, html },
  figure: {
    caption: html,
    src: optional(plain),
    svgText: optional(plain),
    num: optional(plain),
    alt: optional(plain),
    inline: optional(bool),
    px: optional(any),
    maxh: optional(num),
    marks: optional(any),
    fit: optional(any),
  },
  cards: { items: { type: 'cards' }, label: optional(plain) },
  sources: { html },
}

const isText = (value) => typeof value === 'string'
const isCell = (value) => isText(value) || (value !== null && typeof value === 'object' && isText(value.html))
const isStepItem = (value) => isText(value) || (value !== null && typeof value === 'object' && isText(value.html))

/** 필드 종류마다 값이 맞는지 보는 판정. */
const FIELD_CHECKS = {
  html: isText,
  text: isText,
  boolean: (value) => typeof value === 'boolean',
  number: (value) => typeof value === 'number' && Number.isFinite(value),
  any: () => true,
  lines: (value) => isText(value) || (Array.isArray(value) && value.every(isText)),
  textList: (value) => Array.isArray(value) && value.every(isText),
  htmlList: (value) => Array.isArray(value) && value.every(isText),
  pairs: (value) => Array.isArray(value) && value.every((row) => Array.isArray(row) && row.length === 2 && row.every(isText)),
  items: (value) => Array.isArray(value) && value.every(isStepItem),
  cells: (value) => Array.isArray(value) && value.every(isCell),
  rows: (value) => Array.isArray(value) && value.every((row) => Array.isArray(row) && row.every(isCell)),
  cards: (value) =>
    Array.isArray(value) && value.every((card) => card && isText(card.title) && isText(card.value)),
}

/** 블록 하나를 검사해 문제 목록을 돌려준다. extraBlocks = { 종류: 필드 표 } 로 확장 블록을 받는다. */
export function checkBlock(block, path, { calloutKinds = DEFAULT_CALLOUT_KINDS, extraBlocks = {} } = {}) {
  const fields = BLOCK_FIELDS[block?.t] ?? extraBlocks[block?.t]
  if (!fields) return [{ path: `${path}.t`, code: 'unknown-block', got: String(block?.t) }]
  const problems = []
  for (const [name, field] of Object.entries(fields)) {
    const value = block[name]
    if (value === undefined) {
      if (!field.isOptional) problems.push({ path: `${path}.${name}`, code: 'missing-field' })
      continue
    }
    if (!FIELD_CHECKS[field.type](value)) problems.push({ path: `${path}.${name}`, code: 'wrong-field', expected: field.type })
  }
  if (block.t === 'callout' && isText(block.kind) && !calloutKinds.includes(block.kind)) {
    problems.push({ path: `${path}.kind`, code: 'unknown-callout', expected: calloutKinds.join(' | '), got: block.kind })
  }
  if (block.t === 'figure' && !isText(block.src) && !isText(block.svgText)) {
    problems.push({ path: `${path}.src`, code: 'missing-field', expected: 'src | svgText' })
  }
  return problems
}

function checkSection(section, path, options) {
  const problems = []
  if (!isText(section?.title)) problems.push({ path: `${path}.title`, code: 'missing-field' })
  if (!isText(section?.no)) problems.push({ path: `${path}.no`, code: 'missing-field' })
  if (!Array.isArray(section?.blocks)) return [...problems, { path: `${path}.blocks`, code: 'missing-field' }]
  section.blocks.forEach((block, index) => problems.push(...checkBlock(block, `${path}.blocks.${index}`, options)))
  return problems
}

function checkChapter(chapter, path, options) {
  const problems = []
  if (!isText(chapter?.title)) problems.push({ path: `${path}.title`, code: 'missing-field' })
  if (!isText(chapter?.no) && !isText(chapter?.label)) problems.push({ path: `${path}.no`, code: 'missing-field', expected: 'no | label' })
  if (!Array.isArray(chapter?.sections)) return [...problems, { path: `${path}.sections`, code: 'missing-field' }]
  chapter.sections.forEach((section, index) => problems.push(...checkSection(section, `${path}.sections.${index}`, options)))
  return problems
}

/** 책 명세 전체를 검사한다. 문제가 없으면 빈 배열이다. */
export function validateSpec(spec, options = {}) {
  const problems = []
  if (!isText(spec?.title)) problems.push({ path: 'title', code: 'missing-field' })
  if (!Array.isArray(spec?.chapters)) return [...problems, { path: 'chapters', code: 'missing-field' }]
  spec.chapters.forEach((chapter, index) => problems.push(...checkChapter(chapter, `chapters.${index}`, options)))
  return problems
}

/** 장 · 절에 앵커를 붙인 새 명세를 돌려준다. 장은 `ch<i>`, 절은 `ch<i>s<j>` 다. 차례 링크 · 책갈피 · 쪽 번호가 이 이름을 쓴다. */
export function assignAnchors(spec) {
  return {
    ...spec,
    chapters: spec.chapters.map((chapter, chapterIndex) => ({
      ...chapter,
      anchor: `ch${chapterIndex}`,
      sections: chapter.sections.map((section, sectionIndex) => ({ ...section, anchor: `ch${chapterIndex}s${sectionIndex}` })),
    })),
  }
}
