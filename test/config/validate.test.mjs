// 설정 검증 단위 테스트 — 기본값 채우기, 모르는 키 · 틀린 꼴 거절, 문서별 덮어쓰기, 키 사이 규칙.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/config/schema.mjs, src/config/validate.mjs.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { validateConfig } from '../../src/config/validate.mjs'

const minimal = { documents: [{ id: 'guide', mode: 'book', src: 'docs/guide.md' }] }
const codesOf = (raw) => validateConfig(raw).problems.map((problem) => `${problem.code} ${problem.path}`)

describe('기본값', () => {
  test('문서만 있어도 나머지 키는 기본값으로 채운다', () => {
    const { config, problems } = validateConfig(minimal)
    assert.deepEqual(problems, [])
    assert.equal(config.locale, 'ko')
    assert.equal(config.outDir, 'typeset-out')
    assert.equal(config.theme.hue, 250)
    assert.deepEqual(config.theme.fonts, { sans: 'builtin:noto-sans-kr', mono: 'builtin:jetbrains-mono' })
    assert.equal(config.cover.approvalBox, false)
    assert.deepEqual(config.limits, { imageMaxPx: 2000, pdfMaxMb: 90 })
    assert.equal(config.typeset.landTables, 'off')
    assert.deepEqual(config.writing.languages, ['ko'])
    assert.equal(config.documents[0].toc, false)
    assert.equal(config.documents[0].theme, undefined)
  })
  test('documents 는 꼭 있어야 한다', () => {
    assert.deepEqual(codesOf({}), ['missing-key documents'])
  })
})

describe('거절', () => {
  test('모르는 키는 오류다(오타가 조용히 무시되지 않게)', () => {
    assert.deepEqual(codesOf({ ...minimal, thmee: {} }), ['unknown-key thmee'])
    assert.deepEqual(codesOf({ ...minimal, theme: { hue: 10, colour: 'x' } }), ['unknown-key theme.colour'])
  })
  test('꼴이 틀린 값과 범위 밖 값을 알린다', () => {
    assert.deepEqual(codesOf({ ...minimal, locale: 'jp' }), ['not-allowed locale'])
    assert.deepEqual(codesOf({ ...minimal, theme: { hue: 400 } }), ['out-of-range theme.hue'])
    assert.deepEqual(codesOf({ ...minimal, limits: { pdfMaxMb: -1 } }), ['wrong-type limits.pdfMaxMb'])
  })
  test('표지 메타는 [이름, 값] 쌍이어야 한다', () => {
    assert.deepEqual(codesOf({ ...minimal, cover: { meta: [['a', 'b'], ['c']] } }), ['wrong-type cover.meta.1'])
  })
  test('결재 칸은 false 또는 낱말 목록이다', () => {
    assert.deepEqual(validateConfig({ ...minimal, cover: { approvalBox: ['작성', '승인'] } }).config.cover.approvalBox, ['작성', '승인'])
    assert.deepEqual(codesOf({ ...minimal, cover: { approvalBox: true } }), ['no-match cover.approvalBox'])
  })
  test('글꼴은 builtin 이름 또는 파일 목록이다', () => {
    const files = { family: 'My Sans', files: [{ path: 'fonts/a.woff2', weight: 400 }] }
    const { config, problems } = validateConfig({ ...minimal, theme: { fonts: { sans: files } } })
    assert.deepEqual(problems, [])
    assert.deepEqual(config.theme.fonts.sans.files[0], { path: 'fonts/a.woff2', weight: 400, style: 'normal' })
    assert.deepEqual(codesOf({ ...minimal, theme: { fonts: { sans: 'Arial' } } }), ['no-match theme.fonts.sans'])
  })
  test('문서 id 는 소문자 · 숫자 · 붙임표만 쓴다', () => {
    assert.deepEqual(codesOf({ documents: [{ id: 'My Doc', mode: 'book', src: 'a.md' }] }), ['no-match documents.0.id'])
  })
})

describe('문서', () => {
  test('문서별 덮어쓰기는 준 키만 남기고 기본값을 채우지 않는다', () => {
    const raw = { documents: [{ id: 'a', mode: 'book', src: 'a.md', theme: { hue: 30, page: { orientation: 'landscape' } } }] }
    const { config, problems } = validateConfig(raw)
    assert.deepEqual(problems, [])
    assert.deepEqual(config.documents[0].theme, { hue: 30, page: { orientation: 'landscape' } })
  })
  test('덮어쓰기 안의 모르는 키도 오류다', () => {
    const raw = { documents: [{ id: 'a', mode: 'book', src: 'a.md', theme: { page: { margin: 1 } } }] }
    assert.deepEqual(codesOf(raw), ['unknown-key documents.0.theme.page.margin'])
  })
  test('id 가 겹치면 오류다', () => {
    const raw = { documents: [{ id: 'a', mode: 'book', src: 'a.md' }, { id: 'a', mode: 'spec', src: 'a.mjs' }] }
    assert.deepEqual(codesOf(raw), ['duplicate-id documents.1.id'])
  })
  test('pages 전용 키(vars · toc)를 다른 모드에 쓰면 오류다', () => {
    const raw = { documents: [{ id: 'a', mode: 'book', src: 'a.md', vars: { V: '1' } }] }
    assert.deepEqual(codesOf(raw), ['mode-key documents.0.vars'])
    const pages = { documents: [{ id: 'b', mode: 'pages', src: ['p/*.html'], vars: { V: '1' }, toc: true }] }
    assert.deepEqual(codesOf(pages), [])
  })
  test('src 는 경로 하나 또는 경로 목록이다', () => {
    assert.deepEqual(codesOf({ documents: [{ id: 'a', mode: 'pages', src: 3 }] }), ['no-match documents.0.src'])
  })
})

describe('글쓰기 설정', () => {
  test('규칙 모드 · 더할 금지 표현 · 허용 목록을 받는다', () => {
    const writing = {
      languages: ['ko', 'en'],
      rules: { hype: 'ratchet', 'noun-chain': 'warn' },
      extraBanned: { ko: [{ rule: 'hype', pattern: '차세대', suggest: '무엇이 다른지 적는다' }] },
      allow: [{ file: 'docs/glossary.md', rule: 'metaphor', reason: '용어 풀이' }],
    }
    assert.deepEqual(validateConfig({ ...minimal, writing }).problems, [])
    assert.deepEqual(codesOf({ ...minimal, writing: { rules: { hype: 'loud' } } }), ['not-allowed writing.rules.hype'])
    assert.deepEqual(codesOf({ ...minimal, writing: { allow: [{ file: 'a.md' }] } }), [
      'missing-key writing.allow.0.rule',
      'missing-key writing.allow.0.reason',
    ])
  })
})
