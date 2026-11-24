// 웹판 시험 — 차례 링크와 본문 앵커, 스크립트 없음과 내용 보안 정책, 어두운 테마, 표지 정보, 언어.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/web/index.mjs, src/web/styles.mjs.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { renderWebHtml, WEB_CSP, webTocHtml } from '../../src/web/index.mjs'
import { assignAnchors } from '../../src/spec/contract.mjs'
import { variantSettings, virtualSpec } from '../fixtures/virtual-book.mjs'

const settings = variantSettings('plain')
const html = renderWebHtml(virtualSpec(), { settings, fontCss: '@font-face{font-family:x}' })

describe('웹판 HTML', () => {
  test('차례 줄마다 본문에 있는 앵커로 가는 링크이고, 장 · 절 수와 같다', () => {
    const spec = assignAnchors(virtualSpec())
    const toc = webTocHtml(spec)
    const targets = [...toc.matchAll(/href="#([^"]+)"/g)].map((match) => match[1])
    const sectionCount = spec.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0)
    assert.equal(targets.length, spec.chapters.length + sectionCount)
    for (const target of targets) assert.ok(html.includes(`id="${target}"`), target)
  })
  test('스크립트가 없고, 내용 보안 정책이 스크립트와 바깥 자원을 막는다', () => {
    assert.doesNotMatch(html, /<script/i)
    assert.ok(html.includes(`content="${WEB_CSP}"`))
    assert.doesNotMatch(WEB_CSP, /script-src/)
    assert.match(WEB_CSP, /default-src 'none'/)
    assert.doesNotMatch(html, /(src|href)="https?:/)
  })
  test('밝은 · 어두운 테마, 좁은 화면의 접는 차례, 글꼴 CSS 가 들어 있다', () => {
    assert.match(html, /@media \(prefers-color-scheme:dark\)/)
    assert.match(html, /<details class="wtocmini">/)
    assert.match(html, /@media \(max-width:900px\)/)
    assert.ok(html.includes('@font-face{font-family:x}'))
    assert.doesNotMatch(html.match(/<style>([\s\S]*?)<\/style>\s*<\/head>/)[1], /font-weight:(?!400|700)\d+/)
  })
  test('머리에 브랜드 · 제목 · 요약 · 발행 정보, 꼬리에 발행처', () => {
    const spec = virtualSpec()
    assert.ok(html.includes(`<h1 class="wtitle">${spec.title}</h1>`))
    assert.ok(html.includes(`<div class="wbrand">${settings.brand.name}</div>`))
    assert.match(html, /<div class="wedition">\d{4}\.\d{2} · /)
    assert.ok(html.includes('<footer class="wfoot">'))
  })
  test('언어 묶음을 따른다(lang · 차례 낱말)', () => {
    const english = renderWebHtml(virtualSpec(), { settings: { ...settings, locale: 'en' } })
    assert.match(english, /<html lang="en">/)
    assert.match(english, /<summary>Contents<\/summary>/)
    assert.match(html, /<summary>차례<\/summary>/)
  })
  test('settings 없이 부르면 오류다', () => {
    assert.throws(() => renderWebHtml(virtualSpec(), {}), /settings is required/)
  })
})
