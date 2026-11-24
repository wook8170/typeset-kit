// 특성화 테스트 — 옮기기 전 엔진이 가상 책 명세로 낸 결과(fixtures/source-engine.json)와 지금 엔진의 결과가 같은지 본다.
// CSS 기준값은 옮기기 전 CSS 의 굵기를 내장 글꼴의 두 굵기로 바꾼 뒤 잰 값이다(fixtures/characterize.mjs mapWeightsToBuiltin).
// 부르는 곳: npm test. 브라우저가 필요 없는 항목만 있다(쪽 배치는 layout.test.mjs).
// 먼저 읽을 파일: test/fixtures/characterize.mjs(재는 방법), test/fixtures/virtual-book.mjs(원고).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { renderPrintHtml } from '../../src/render/index.mjs'
import { paginatorScript, roman } from '../../src/render/paginator.mjs'
import { svgProblem } from '../../src/render/svg-guard.mjs'
import { contentColWidths, isLandTable, LAND_TABLE_W } from '../../src/render/table-widths.mjs'
import {
  COLUMN_CASES, LAND_CASES, mapWeightsToBuiltin, MESSAGES, normalizeCss, normalizeScript, PAGINATOR_OPTION_SETS, restoreSourceTocTitle, sha256, splitPrintHtml, SVG_CASES,
} from '../fixtures/characterize.mjs'
import { VARIANTS, variantSettings, virtualSpec } from '../fixtures/virtual-book.mjs'

const golden = JSON.parse(readFileSync(new URL('../fixtures/source-engine.json', import.meta.url), 'utf8'))

describe('인쇄판 HTML 이 옮기기 전과 같다', () => {
  for (const name of Object.keys(VARIANTS)) {
    test(`${name}: 흐름 블록은 차례 제목 낱말만 빼고 바이트까지, 문서 CSS 는 주석 · 공백을 뺀 코드가 같다`, () => {
      const printed = splitPrintHtml(renderPrintHtml(virtualSpec(), { settings: variantSettings(name) }))
      const { css } = printed
      const flow = restoreSourceTocTitle(printed.flow, '차례')
      assert.equal(flow.length, golden.variants[name].flowLength)
      assert.equal(sha256(flow), golden.variants[name].flowSha)
      assert.equal(sha256(normalizeCss(css)), golden.variants[name].cssSha)
    })
    test(`${name}: 문서 CSS 는 굵기 400 · 700 만 쓴다(내장 글꼴의 두 굵기)`, () => {
      const { css } = splitPrintHtml(renderPrintHtml(virtualSpec(), { settings: variantSettings(name) }))
      assert.equal(mapWeightsToBuiltin(normalizeCss(css)), normalizeCss(css))
      assert.deepEqual([...new Set(normalizeCss(css).match(/font-weight:\d+/g))].sort(), ['font-weight:400', 'font-weight:700'])
    })
  }
})

test('쪽 나누기 스크립트: 선택 사항 묶음마다 코드가 옮기기 전과 같다(주석 · 오류 문구 · 로마 숫자 함수 이름만 다르다)', () => {
  for (const [name, opts] of Object.entries(PAGINATOR_OPTION_SETS)) {
    const code = normalizeScript(paginatorScript(opts), { romanSource: roman.toString(), messages: MESSAGES })
    assert.equal(sha256(code), golden.scripts[name], name)
  }
})

test('로마 숫자 · 열 폭 · 가로 판정 · SVG 판정이 옮기기 전과 같다', () => {
  assert.deepEqual(Array.from({ length: 39 }, (_, i) => roman(i + 1)), golden.roman)
  assert.deepEqual(COLUMN_CASES.map(([head, rows]) => contentColWidths(head, rows)), golden.columns)
  assert.deepEqual(COLUMN_CASES.map(([head, rows]) => contentColWidths(head, rows, { tableWidth: LAND_TABLE_W })), golden.columnsLand)
  assert.deepEqual(LAND_CASES.map(([block, minCols]) => isLandTable(block, { mode: 'auto', minCols })), golden.land)
  assert.deepEqual(SVG_CASES.map((svg) => svgProblem(svg) === null), golden.svg)
})
