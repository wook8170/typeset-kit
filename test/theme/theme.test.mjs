// 테마 단위 테스트 — 문서 색, 글꼴 스택, 콜아웃 색 더하기.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/theme/index.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CALLOUT_COLORS, defineTheme, fontStacks, hueColor, MONO, SANS } from '../../src/theme/index.mjs'

test('기본 테마는 색상 각 250 의 문서 색과 기본 글꼴 스택을 쓴다', () => {
  const theme = defineTheme()
  assert.equal(theme.accent, 'oklch(0.52 0.09 250)')
  assert.equal(theme.sans, SANS)
  assert.equal(theme.mono, MONO)
  assert.deepEqual(theme.callouts, { ...CALLOUT_COLORS })
  assert.equal(hueColor(30), 'oklch(0.52 0.09 30)')
})

test('다른 글꼴 이름을 주면 스택을 바꾸고, 코드 글꼴 뒤에 본문 글꼴을 둔다(코드 안 한글)', () => {
  assert.deepEqual(fontStacks({ sans: 'Inter', mono: 'Fira Code' }), { sans: "'Inter',sans-serif", mono: "'Fira Code','Inter',ui-monospace,Menlo,monospace" })
  assert.equal(fontStacks({ sans: "Bad'Name" }).sans, "'BadName',sans-serif", '따옴표는 지운다')
})

test('콜아웃 종류를 더하면 기본 세 종류에 합친다', () => {
  const theme = defineTheme({ hue: 10, callouts: { tip: 'oklch(0.5 0.1 150)' } })
  assert.equal(theme.callouts.tip, 'oklch(0.5 0.1 150)')
  assert.equal(theme.callouts.note, CALLOUT_COLORS.note)
  assert.equal(theme.accent, 'oklch(0.52 0.09 10)')
})
