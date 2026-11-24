// 규칙 적용 시험 — 규칙 고르기(언어 · 모드 · 추가 표현), 한글 · 영어 줄 구분, 겹침 제거, 명사 사슬을 확인한다.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/writing/rules.mjs, src/writing/scan.mjs.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { knownRuleNames, resolveRuleMode, selectRules } from '../../src/writing/rules.mjs'
import { findNounChains, scanLines } from '../../src/writing/scan.mjs'

const lineOf = (text) => [{ line: 1, text }]
const select = (overrides = {}) => selectRules({ languages: ['ko'], rules: {}, extraBanned: {}, ...overrides })
const ruleNamesOf = (matches) => matches.map((match) => match.rule)

describe('한국어 규칙', () => {
  test('lanekit 묶음의 표현을 묶음 이름과 함께 찾는다', () => {
    const matches = scanLines(lineOf('이 도구는 강력한 기능을 단위 시험 으로 검증한다. 검토 결과 문제가 없다.'), select())
    assert.deepEqual(ruleNamesOf(matches).sort(), ['ai-trace', 'forced-translation', 'hype'])
    assert.equal(matches.find((match) => match.rule === 'hype').suggest, '무엇을 할 수 있는지 적는다')
  })
  test('추가 규칙 파일의 표현(과장 · AI 흔적)을 같은 묶음에서 찾는다', () => {
    const matches = scanLines(lineOf('심리스 연동을 살펴보겠습니다. TODO 정리'), select())
    assert.deepEqual(ruleNamesOf(matches).sort(), ['ai-trace', 'ai-trace', 'hype'])
  })
  test('같은 낱말이 두 표현에 걸려도 한 건으로 센다', () => {
    const matches = scanLines(lineOf('이제 살펴보겠습니다'), select())
    assert.equal(matches.filter((match) => match.rule === 'ai-trace').length, 1)
  })
  test('개발자 방언은 기본값이 꺼져 있고, 켜면 찾는다', () => {
    const text = '파이프라인을 정리한다'
    assert.equal(scanLines(lineOf(text), select()).length, 0)
    assert.deepEqual(ruleNamesOf(scanLines(lineOf(text), select({ rules: { 'dev-jargon': 'warn' } }))), ['dev-jargon'])
  })
  test('off 로 끈 묶음은 찾지 않는다', () => {
    assert.equal(scanLines(lineOf('강력한 기능'), select({ rules: { hype: 'off' } })).length, 0)
  })
  test('extraBanned 의 표현은 지정한 묶음 이름으로 찾는다', () => {
    const rules = select({ extraBanned: { ko: [{ rule: 'hype', pattern: '차세대', suggest: '무엇이 다른지 적는다' }] } })
    const matches = scanLines(lineOf('차세대 도구'), rules)
    assert.equal(matches[0].rule, 'hype')
    assert.equal(matches[0].suggest, '무엇이 다른지 적는다')
  })
})

describe('언어 판정', () => {
  test('한국어 규칙은 한글 있는 줄에만, 영어 규칙은 한글 없는 줄에만 적용한다', () => {
    const rules = select({ languages: ['ko', 'en'] })
    assert.deepEqual(ruleNamesOf(scanLines(lineOf('This is robust and seamless.'), rules)), ['hype', 'hype'])
    assert.deepEqual(ruleNamesOf(scanLines(lineOf('이것은 seamless 하다 강력한'), rules)).sort(), ['hype', 'hype'])
    assert.equal(scanLines(lineOf('Hello world'), select({ languages: ['ko'] })).length, 0)
  })
  test('languages 가 영어만이면 한글 줄은 건드리지 않는다', () => {
    assert.equal(scanLines(lineOf('강력한 기능'), select({ languages: ['en'] })).length, 0)
  })
  test('languages 가 비면 적용할 규칙이 없다', () => {
    const rules = select({ languages: [] })
    assert.deepEqual(rules, { korean: {}, english: {}, nounChain: false })
  })
})

describe('규칙 모드', () => {
  test('설정이 없으면 기본 모드이고, 알 수 없는 묶음은 ratchet 이다', () => {
    assert.equal(resolveRuleMode('hype', {}), 'ratchet')
    assert.equal(resolveRuleMode('dev-jargon', {}), 'off')
    assert.equal(resolveRuleMode('custom', {}), 'ratchet')
    assert.equal(resolveRuleMode('hype', { hype: 'fail' }), 'fail')
  })
  test('명사 사슬은 off 와 warn 만 허용하고 ratchet · fail 은 warn 으로 낮춘다', () => {
    assert.equal(resolveRuleMode('noun-chain', { 'noun-chain': 'fail' }), 'warn')
    assert.equal(resolveRuleMode('noun-chain', { 'noun-chain': 'off' }), 'off')
    assert.equal(select({ rules: { 'noun-chain': 'off' } }).nounChain, false)
  })
  test('알려진 묶음 이름에 extraBanned 의 새 이름이 들어간다', () => {
    const known = knownRuleNames({ ko: [{ rule: 'custom', pattern: 'x' }] })
    for (const name of ['hype', 'noun-chain', 'dev-jargon', 'custom']) assert.ok(known.has(name), name)
  })
})

describe('명사 사슬', () => {
  test('조사 없이 이어진 한글 낱말 4개 이상만 잡는다', () => {
    assert.deepEqual(findNounChains('사용자 권한 기반 데이터 접근 통제를 둔다'), [{ text: '사용자 권한 기반 데이터 접근' }])
  })
  test('세 낱말 이하이거나 조사로 끊기면 잡지 않는다', () => {
    assert.deepEqual(findNounChains('권한 기반 접근 통제를 둔다'), [])
    assert.deepEqual(findNounChains('권한을 기반 데이터 접근'), [])
  })
  test('scanLines 는 명사 사슬을 noun-chain 으로 낸다', () => {
    assert.deepEqual(ruleNamesOf(scanLines(lineOf('사용자 권한 기반 데이터 접근 통제'), select())), ['noun-chain'])
  })
})
