// 가로 쪽 표 테스트 — 판정, 조판 HTML(data-land · 「(계속)」), 헤드리스 브라우저에서의 쪽 배치.
// 부르는 곳: npm test. 브라우저가 없으면 배치 테스트만 건너뛴다.
// 먼저 읽을 파일: src/render/table-widths.mjs 의 isLandTable, src/render/paginator.mjs 의 가로 쪽 처리.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withChrome } from '../../src/browser/chrome.mjs'
import { renderPrintHtml } from '../../src/render/index.mjs'
import { isLandTable, LAND_TABLE_W } from '../../src/render/table-widths.mjs'
import { browserSkipReason } from '../fixtures/browser.mjs'
import { typesetLayout } from '../fixtures/characterize.mjs'
import { variantSettings, virtualSpec, wideRows } from '../fixtures/virtual-book.mjs'

const cols = (count) => Array.from({ length: count }, (_, i) => `머리${i}`)
const AUTO = { mode: 'auto', minCols: 8 }

test('판정: auto 면 전체 열 minCols 개 이상이 가로, 표의 land 가 먼저, off · compact 는 늘 세로', () => {
  assert.equal(isLandTable({ head: cols(8), rows: [] }, AUTO), true)
  assert.equal(isLandTable({ head: cols(7), rows: [] }, AUTO), false)
  assert.equal(isLandTable({ rows: [cols(9)] }, AUTO), true, '머리글이 없으면 가장 긴 행의 칸 수')
  assert.equal(isLandTable({ head: cols(3), rows: [], land: true }, AUTO), true)
  assert.equal(isLandTable({ head: cols(12), rows: [], land: false }, AUTO), false)
  assert.equal(isLandTable({ head: cols(12), rows: [] }, { mode: 'off' }), false)
  assert.equal(isLandTable({ head: cols(12), rows: [], land: true }), false, '기본은 off')
  assert.equal(isLandTable({ head: cols(12), rows: [], compact: true }, AUTO), false)
  assert.equal(isLandTable({ head: cols(4), rows: [] }, { mode: 'auto', minCols: 4 }), true)
})

test('조판 HTML: 가로 표 · 캡션에 data-land, 「(계속)」 문구, 가로 쪽 CSS, 켜지 않으면 종전 마크업', () => {
  const on = renderPrintHtml(virtualSpec(), { settings: variantSettings('options') })
  assert.ok(on.includes('<div class="btblwrap" data-land="1" data-cont="표 2-1 (계속)">'))
  assert.ok(on.includes('<div class="btblwrap" data-land="1" data-cont="(계속)">'), '번호 없는 가로 표')
  assert.ok(on.includes('<div class="btblcap" data-land="1">표 2-1 · 긴 가로 표</div>'))
  assert.ok(on.includes('.btblcont::before{content:attr(data-cont)') && on.includes('function markCont(c)'))
  assert.ok(on.includes('@page land{size:297mm 210mm;margin:0}') && on.includes('function landLead(i)'))
  assert.ok(on.includes('<figure class="bfig" data-fit="land" data-land="1">') && on.includes('style="--fw:1009px;--fh:232px"'))
  assert.equal(LAND_TABLE_W, 1027)
  const off = renderPrintHtml(virtualSpec(), { settings: variantSettings('plain') })
  for (const word of ['data-land', '@page land', 'landLead', 'data-cont', 'btblcont', 'markCont', 'data-fit']) assert.ok(!off.includes(word), word)
  const book = renderPrintHtml(virtualSpec(), { settings: variantSettings('landscape') })
  assert.ok(!book.includes('data-land="1"') && book.includes('data-cont="표 1-2 (계속)"'), '가로 책은 가로 쪽 표시 없이 「(계속)」만')
  assert.ok(book.includes('@page{size:297mm 210mm;margin:0}') && book.includes('.cvmain{top:112px;right:500px}'))
})

const rowsOf = (pages, tag) => pages.flatMap((page) => page.rows.filter((row) => row.startsWith(tag)))
const longSpec = (rowCount) => ({
  title: '긴 표',
  chapters: [{ no: '1', title: '장', sections: [
    { no: '1.1', title: '긴 가로 표', blocks: [{ t: 'table', head: cols(10), rows: wideRows(rowCount, 'C'), caption: '긴 가로 표', num: '1-1' }] },
    { no: '1.2', title: '다시 세로', blocks: [{ t: 'p', html: '세로 문단' }] },
  ] }],
})

test('조판: 긴 가로 표를 가로 쪽에서 행 단위로 잇고, 연속 가로 표는 같은 묶음, 그 뒤는 세로 쪽', { skip: browserSkipReason(), timeout: 180000 }, async () => {
  let layout
  let long
  await withChrome(async (cdp) => {
    layout = await typesetLayout(cdp, renderPrintHtml(virtualSpec(), { settings: variantSettings('options') }))
    long = await typesetLayout(cdp, renderPrintHtml(longSpec(80), { settings: variantSettings('options') }))
  })
  assert.equal(layout.err, null)
  assert.deepEqual(layout.overflow, [])
  const body = layout.pages.filter((page) => /^\d+$/.test(page.label))
  const at = (id) => body.find((page) => page.ids.includes(id))
  assert.equal(at('ch1s0').land, false)
  assert.equal(at('ch1s1').land, true, '가로 표 앞 절 제목은 가로 쪽에')
  const tablePages = body.filter((page) => page.rows.some((row) => row.startsWith('A-')))
  assert.ok(tablePages.length >= 2, `표가 여러 가로 쪽에 나뉜다(${tablePages.length}쪽)`)
  for (const page of tablePages) {
    assert.equal(page.land, true)
    assert.ok(page.theads >= 1, `${page.label}쪽 머리글 반복`)
    assert.equal(page.foot, page.label, '꼬리글 쪽 번호')
    assert.match(page.head, /^2\. 넓은 자료 › 2\.[23] /, `머리글 「${page.head}」`)
  }
  assert.deepEqual(rowsOf(tablePages, 'A-'), wideRows(37, 'A').map((row) => row[0]), '행이 순서대로 빠짐없이')
  assert.equal(tablePages.at(-1).caps, 1, '캡션은 마지막 조각과 같은 쪽')
  assert.equal(at('ch1s2').label, tablePages.at(-1).label, '연속 가로 표는 같은 가로 쪽')
  assert.equal(at('ch1s4').land, false, '가로 묶음 뒤 절은 세로 쪽')

  const longBody = long.pages.filter((page) => /^\d+$/.test(page.label))
  const longPages = longBody.filter((page) => page.rows.some((row) => row.startsWith('C-')))
  assert.deepEqual(long.overflow, [])
  assert.deepEqual(rowsOf(longPages, 'C-'), wideRows(80, 'C').map((row) => row[0]))
  longPages.forEach((page, k) => assert.equal(page.conts, k > 0 ? 1 : 0, `${page.label}쪽 「(계속)」 표시`))
  const count = (page) => page.rows.filter((row) => row.startsWith('C-')).length
  const perPage = count(longPages[1])
  for (const page of longPages.slice(1, -1)) assert.equal(count(page), perPage, `${page.label}쪽 행 수`)
  assert.equal(longPages.length, 1 + Math.ceil((80 - count(longPages[0])) / perPage), '표 쪽 수')
  assert.equal(longBody.find((page) => page.ids.includes('ch0s1')).land, false)
})
