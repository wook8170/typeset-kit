// 책 명세 계약 단위 테스트 — 블록 종류마다 필수 필드 · 꼴, 콜아웃 종류, 확장 블록, 앵커 이름.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/spec/contract.mjs, docs/contract.md 「블록 계약」.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { assignAnchors, BLOCK_FIELDS, checkBlock, validateSpec } from '../../src/spec/contract.mjs'

/** 블록 종류마다 계약을 지킨 예. 계약 문서의 예와 같은 꼴이다. */
const VALID_BLOCKS = [
  { t: 'p', html: 'Body <b>bold</b>' },
  { t: 'lede', html: 'Lead' },
  { t: 'h3', text: 'Sub heading', sub: 'one line' },
  { t: 'defs', rows: [['Term', 'Meaning']] },
  { t: 'steps', label: 'Steps', items: ['First', { html: 'Second', code: 'npm i', note: 'note' }] },
  { t: 'ol', start: 3, items: ['Third'] },
  { t: 'ul', items: ['a', 'b'] },
  { t: 'code', lines: ['line 1', 'line 2'] },
  { t: 'table', head: ['A', { html: 'B', align: 'center' }], rows: [['1', { html: '2', mono: true, span: 1 }]], caption: 'Cap', num: '1-1', land: false },
  { t: 'callout', kind: 'note', html: 'Note body' },
  { t: 'figure', src: 'img/a.png', caption: 'Figure', num: '1', alt: 'alt' },
  { t: 'figure', svgText: '<svg/>', caption: 'Inline svg' },
  { t: 'cards', items: [{ title: 'T', value: '1', note: 'n' }] },
  { t: 'sources', html: 'Source list' },
]

const sampleSpec = () => ({
  title: 'Acme Guide',
  chapters: [
    { no: '1', title: 'Start', sections: [{ no: '1.1', title: 'Install', blocks: VALID_BLOCKS }] },
    { label: 'Appendix', title: 'More', sections: [{ no: 'A.1', title: 'Extra', blocks: [] }, { no: 'A.2', title: 'X', blocks: [] }] },
  ],
})

describe('블록', () => {
  test('계약을 지킨 블록은 문제가 없다(블록 종류를 모두 덮는다)', () => {
    for (const block of VALID_BLOCKS) assert.deepEqual(checkBlock(block, 'b'), [], block.t)
    const covered = new Set(VALID_BLOCKS.map((block) => block.t))
    assert.deepEqual(Object.keys(BLOCK_FIELDS).filter((kind) => !covered.has(kind)), [])
  })
  test('모르는 종류 · 빠진 필드 · 틀린 꼴을 알린다', () => {
    assert.deepEqual(checkBlock({ t: 'quote' }, 'b'), [{ path: 'b.t', code: 'unknown-block', got: 'quote' }])
    assert.deepEqual(checkBlock({ t: 'p' }, 'b').map((problem) => problem.code), ['missing-field'])
    assert.deepEqual(checkBlock({ t: 'defs', rows: [['only one']] }, 'b').map((problem) => problem.code), ['wrong-field'])
    assert.deepEqual(checkBlock({ t: 'table', rows: [[1]] }, 'b').map((problem) => problem.path), ['b.rows'])
  })
  test('그림은 src 와 svgText 가운데 하나가 있어야 한다', () => {
    assert.deepEqual(checkBlock({ t: 'figure', caption: 'c' }, 'b').map((problem) => problem.code), ['missing-field'])
  })
  test('콜아웃 종류는 기본 셋 또는 설정에서 더한 종류다', () => {
    assert.deepEqual(checkBlock({ t: 'callout', kind: 'tip', html: 'x' }, 'b').map((problem) => problem.code), ['unknown-callout'])
    assert.deepEqual(checkBlock({ t: 'callout', kind: 'tip', html: 'x' }, 'b', { calloutKinds: ['note', 'tip'] }), [])
  })
  test('확장 블록은 필드 표를 주면 받는다', () => {
    const extraBlocks = { storyboard: { fig: { type: 'any' } } }
    assert.deepEqual(checkBlock({ t: 'storyboard', fig: {} }, 'b', { extraBlocks }), [])
    assert.equal(checkBlock({ t: 'storyboard', fig: {} }, 'b')[0].code, 'unknown-block')
  })
})

describe('책 명세', () => {
  test('계약을 지킨 명세는 문제가 없다', () => {
    assert.deepEqual(validateSpec(sampleSpec()), [])
  })
  test('제목 · 장 · 절의 빠진 필드를 경로와 함께 알린다', () => {
    const broken = { chapters: [{ title: 'x', sections: [{ title: 's', blocks: [{ t: 'p' }] }] }] }
    assert.deepEqual(
      validateSpec(broken).map((problem) => problem.path),
      ['title', 'chapters.0.no', 'chapters.0.sections.0.no', 'chapters.0.sections.0.blocks.0.html'],
    )
  })
  test('앵커는 장 ch<i>, 절 ch<i>s<j> 이고 원래 명세를 바꾸지 않는다', () => {
    const spec = sampleSpec()
    const anchored = assignAnchors(spec)
    assert.deepEqual(
      anchored.chapters.map((chapter) => [chapter.anchor, ...chapter.sections.map((section) => section.anchor)]),
      [['ch0', 'ch0s0'], ['ch1', 'ch1s0', 'ch1s1']],
    )
    assert.equal(spec.chapters[0].anchor, undefined)
  })
})
