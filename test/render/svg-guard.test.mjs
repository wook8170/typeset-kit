// SVG 허용 목록 테스트 — 허용 목록 밖 요소 · 속성, 문서 밖 참조, 읽을 수 없는 SVG 를 실패로 판정하는지와 목록 더하기.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/render/svg-guard.mjs(읽기 규칙).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertSafeSvg, svgAllowList, svgProblem, SVG_ELEMENTS } from '../../src/render/svg-guard.mjs'

const wrap = (inner, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"${attrs}>${inner}</svg>`
const ok = (svg, allow) => assert.equal(svgProblem(svg, allow), null, svg.slice(0, 120))
const bad = (svg, pattern) => {
  const problem = svgProblem(svg)
  assert.ok(problem, `should fail: ${String(svg).slice(0, 120)}`)
  if (pattern) assert.match(problem, pattern)
}

test('허용 요소 · 속성만 쓴 그림은 지난다(주석 · 같은 속성 두 번 · 문서 안 url( · 기본 문자 참조)', () => {
  assert.ok(SVG_ELEMENTS.includes('tspan') && !SVG_ELEMENTS.includes('script'))
  ok(wrap('<defs><marker id="a"><path d="M0 0L1 1"/></marker></defs><line x1="0" y1="0" x2="1" y2="1" marker-end="url(#a)"/>'))
  ok(wrap('<!-- note --><rect x="1" y="1" width="2" height="2" style="fill:url( \'#g\' );stroke:#000"/>'))
  ok(wrap('<line x1="0" y1="0" x2="1" y2="1" stroke-width="1" stroke-width="1.4"/>'))
  ok(wrap('<text x="1" y="1" font-family="&#x27;Noto Sans KR&#x27;">A &amp; B &lt; C</text>'))
  ok(`<!-- sha256=00 -->\n${wrap('<g/>')}\n`)
  ok(wrap('<image x="0" y="0" width="1" height="1" href="data:image/png;base64,iVBORw0KGgo="/>'))
  ok(`﻿${wrap('<g/>')}`)
})

test('허용 목록 밖 요소는 실패한다', () => {
  for (const element of ['script', 'foreignObject', 'meta', 'link', 'base', 'iframe', 'style', 'use', 'a', 'animate', 'set', 'object', 'embed']) {
    bad(wrap(`<${element}/>`), /element not in the allow list/)
  }
})

test('대소문자 · 이름공간 접두어를 섞어도 같은 판정', () => {
  bad(wrap('<SCRIPT/>'), /element not in the allow list "SCRIPT"/)
  bad(wrap('<svg:script/>'), /"svg:script"/)
  bad(wrap('<rect ONLOAD="x"/>'), /attribute not in the allow list "ONLOAD"/)
  bad(wrap("<rect onclick='x'/>"), /attribute not in the allow list/)
  bad(wrap('<image xlink:href="data:image/png;base64,AAAA"/>'), /xlink:href/)
  bad('<SVG xmlns="http://www.w3.org/2000/svg"></SVG>', /SVG/)
  bad(wrap('<g/>', ' xmlns:xlink="http://www.w3.org/1999/xlink"'), /xmlns:xlink/)
})

test('href 는 image 요소의 그림 data 주소만 받는다', () => {
  bad(wrap('<rect href="data:image/png;base64,AAAA"/>'), /only on image/)
  for (const value of ['x.png', 'file:///etc/hosts', 'http://example.invalid/a.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=']) {
    bad(wrap(`<image href="${value}"/>`), /href/)
  }
  bad(wrap('<image href="&#x64;ata:text/html;base64,AAAA"/>'), /not an image data URI/)
})

test('문서 밖 url( · 자원을 부르는 CSS 함수 · 감춘 값은 실패한다', () => {
  bad(wrap('<rect fill="url(http://example.invalid/x)"/>'), /outside the document/)
  bad(wrap('<rect fill="URL(file:///etc/hosts)"/>'), /outside the document/)
  bad(wrap("<rect style='marker-end:url(\"x.svg#a\")'/>"), /outside the document/)
  bad(wrap('<rect style="fill:&#117;rl(file:///etc/hosts)"/>'), /outside the document/)
  bad(wrap('<rect style="fill:u\\72 l(file:///etc/hosts)"/>'), /backslash/)
  bad(wrap('<rect style="fill:image-set(\'x.png\' 1x)"/>'), /CSS function/)
  bad(wrap('<g/>', ' xmlns="http://example.invalid/ns"'), /namespace/)
})

test('읽을 수 없는 SVG 는 실패한다', () => {
  bad(wrap('<rect>'), /not closed|does not match/)
  bad(wrap('<g></rect>'), /does not match/)
  bad(wrap('<rect x=1/>'), /not quoted/)
  bad(wrap('<rect x="1"y="2"/>'), /no space/)
  bad(`${wrap('')}${wrap('')}`, /more than one root/)
  bad(`text${wrap('')}`, /outside the root/)
  bad('<g/>', /root element is not svg/)
  bad('', /no elements/)
  bad(wrap('<![CDATA[<script>x</script>]]>'), /CDATA/)
  bad(`<!DOCTYPE svg [<!ENTITY x "y">]>${wrap('')}`, /DOCTYPE/)
  bad(wrap('<?xml-stylesheet href="x.css"?>'), /processing instructions/)
  bad(wrap('<text>&nbsp;</text>'), /not allowed/)
  bad(wrap('<text>R&D</text>'), /character reference/)
  bad(wrap('<!--> <script/> -->'), /comment/)
  bad(wrap('<!-- 닫히지 않음'), /comment is not closed/)
  bad(null, /not a string/)
})

test('허용 목록을 더할 수 있고, 스크립트 요소 · 이벤트 속성은 더할 수 없다', () => {
  const allow = svgAllowList({ elements: ['linearGradient', 'stop'], attrs: ['offset', 'stop-color'] })
  ok(wrap('<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>'), allow)
  bad(wrap('<linearGradient/>'), /linearGradient/)
  assert.throws(() => svgAllowList({ elements: ['script'] }), /cannot include element "script"/)
  assert.throws(() => svgAllowList({ attrs: ['onload'] }), /cannot include attribute "onload"/)
  assert.throws(() => svgAllowList({ attrs: ['xlink:href'] }), /cannot include attribute/)
})

test('assertSafeSvg — 걸리면 그림 이름을 붙여 오류, 지나면 아무 일 없음', () => {
  assert.doesNotThrow(() => assertSafeSvg(wrap('<g/>'), 'ok.svg'))
  assert.throws(() => assertSafeSvg(wrap('<script/>'), 'docs/x.svg'), /SVG check failed \(docs\/x\.svg\): element not in the allow list "script"/)
})
