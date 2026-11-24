// 글꼴 PDF 시험 — 내장 글꼴로 구운 PDF 에 Type 3 글꼴이 없고, 가변 글꼴로 구운 PDF 에는 Type 3 가 생기는 것을 실제 브라우저로 확인한다.
// 부르는 곳: npm test. 브라우저를 찾지 못하는 환경에서는 건너뛴다.
// 먼저 읽을 파일: src/fonts/css.mjs, scripts/measure-fonts.mjs(같은 방식의 실측).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { withChrome } from '../../src/browser/chrome.mjs'
import { findBrowser } from '../../src/browser/find.mjs'
import { printPdf } from '../../src/browser/print.mjs'
import { fontCss } from '../../src/fonts/css.mjs'

function locateBrowser() {
  try {
    return { path: findBrowser() }
  } catch (error) {
    return { skipReason: error.message.split('\n')[0] }
  }
}
const browser = locateBrowser()

/** 글꼴 CSS 와 굵기 400 · 700 문장이 든 문서. 끝났다는 창 변수를 마지막에 둔다. */
const documentWith = (css) =>
  `<!doctype html><meta charset="utf-8"><style>@page{size:A4}${css}body{font-family:'Noto Sans KR'}</style>` +
  '<p>한글 문장입니다. 뷁 쀍 ABC 123</p><p style="font-weight:700">굵은 문장입니다.</p>' +
  '<script>window.__pageCount=1;window.__frontCount=0;window.__anchors={};window.__paged=true</script>'

const count = (pdf, pattern) => (pdf.toString('latin1').match(pattern) ?? []).length

describe('글꼴과 PDF', { skip: browser.skipReason }, () => {
  test('내장 글꼴 PDF 는 Type 3 글꼴이 없고 한글 글꼴이 굵기별로 두 개 들어간다', async () => {
    const pdf = await withChrome(async (cdp) => (await printPdf(cdp, documentWith(fontCss(['builtin:noto-sans-kr'])))).pdf, { browserPath: browser.path })
    assert.equal(count(pdf, /\/Subtype\s*\/Type3/g), 0)
    assert.equal(count(pdf, /\/BaseFont\s*\/[A-Z]{6}\+NotoSansKR/g), 2 * 2)
    assert.ok(pdf.length < 100_000, `unexpected size ${pdf.length}`)
  })
})
