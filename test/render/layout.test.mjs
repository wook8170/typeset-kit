// 쪽 배치 특성화 테스트 — 헤드리스 브라우저로 가상 책 명세를 조판해, 옮기기 전 엔진의 쪽 배치(fixtures/source-engine.json)와 견준다.
// 부르는 곳: npm test. 기준값과 같은 내장 글꼴을 문서에 넣으므로 운영체제와 상관없이 돈다. 브라우저가 없거나 글꼴 너비 표본이 다르면 건너뛴다.
// 먼저 읽을 파일: test/fixtures/characterize.mjs 의 typesetLayout(쪽마다 읽는 값).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { withChrome } from '../../src/browser/chrome.mjs'
import { fontCss } from '../../src/fonts/css.mjs'
import { renderPrintHtml } from '../../src/render/index.mjs'
import { browserSkipReason } from '../fixtures/browser.mjs'
import { typesetLayout } from '../fixtures/characterize.mjs'
import { VARIANTS, variantSettings, virtualSpec } from '../fixtures/virtual-book.mjs'

const BUILTIN_FONT_CSS = fontCss(['builtin:noto-sans-kr', 'builtin:jetbrains-mono'])
const golden = JSON.parse(readFileSync(new URL('../fixtures/source-engine.json', import.meta.url), 'utf8'))

test('변형마다 쪽 수 · 쪽 번호 · 쪽마다 실린 블록 · 머리글 · 꼬리글 · 앵커 · 넘친 쪽이 옮기기 전과 같다', { skip: browserSkipReason(), timeout: 180000 }, async (t) => {
  await withChrome(async (cdp) => {
    for (const name of Object.keys(VARIANTS)) {
      const layout = await typesetLayout(cdp, renderPrintHtml(virtualSpec(), { settings: variantSettings(name), fontCss: BUILTIN_FONT_CSS }))
      const expected = golden.variants[name].layout
      await t.test(name, { skip: layout.probeWidth !== expected.probeWidth && `fonts differ from the captured ones (${layout.probeWidth} vs ${expected.probeWidth})` }, () => {
        assert.equal(layout.err, null)
        assert.deepEqual(layout, expected)
      })
    }
  })
})
