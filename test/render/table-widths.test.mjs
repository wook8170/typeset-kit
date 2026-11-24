// 표 열 폭 테스트 — 내용 길이에 비례한 열 폭(contentColWidths)과, typeset.tableColWidths 를 켤 때만 colgroup 이 붙는지.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/render/table-widths.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderPrintHtml } from '../../src/render/index.mjs'
import { contentColWidths, textWidth } from '../../src/render/table-widths.mjs'
import { variantSettings } from '../fixtures/virtual-book.mjs'

const percents = (widths) => widths.map((width) => Number(width.replace('%', '')))
const total = (widths) => widths.reduce((sum, width) => sum + width, 0)

test('글자 폭: 라틴 1 · 한글 1.8, 태그는 빼고 문자 참조는 한 글자', () => {
  assert.equal(textWidth('ab'), 2)
  assert.equal(textWidth('가나'), 3.6)
  assert.equal(textWidth('<code>a</code>&amp;'), 2)
})

test('숫자 하나뿐인 열은 좁고, 긴 설명 열이 가장 넓다', () => {
  const widths = percents(contentColWidths(['단계', '파일', '설명'], [
    ['1', '<code>server/src/db/migrate.ts</code>', '파일을 차례로 적용하고 실패하면 되돌린 뒤 기록을 남긴다'],
    ['2', '<code>server/src/db/a.ts</code>', '실패하면 되돌린다'],
  ]))
  assert.ok(widths[0] < 12, `단계 열 ${widths[0]}%`)
  assert.ok(widths[2] > widths[0] && widths[2] >= widths[1])
  assert.ok(Math.abs(total(widths) - 100) < 0.5)
})

test('빈 열은 하한(6%) 근처로 줄고, 어떤 열도 하한 밑으로 내려가지 않는다', () => {
  const long = '아주 긴 설명 '.repeat(30)
  const widths = percents(contentColWidths(['이름', '비고', '근거', '설명'], [['a', '', '<code>docs/x.md:12-40</code> 부근', long], ['b', '', '-', long]]))
  assert.ok(widths[1] <= 10, `빈 열 ${widths[1]}%`)
  assert.ok(widths.every((width) => width >= 5.95), widths.join(','))
  assert.ok(widths[3] > 50, `설명 열 ${widths[3]}%`)
})

test('긴 파일 이름(36자 이하)은 한 줄에 들어가는 폭을 받는다', () => {
  const name = '182_report_schedule_form_delivery.sql'
  const widths = percents(contentColWidths(['파일', '종류', '머리 주석'], [[`<code>${name}</code>`, 'additive', '설명 '.repeat(40)]]))
  assert.ok((widths[0] / 100) * 666 >= 36 * 7, `파일 열 ${widths[0]}%`)
})

test('두 칸 라벨 · 값 표: 라벨 열은 18 ~ 28% 이고 가장 긴 라벨이 한 줄에 들어간다', () => {
  const rows = [['책임', '같은 조회 결과를 어떻게 보일지 정한다. '.repeat(4)], ['주요 속성 — 표시 · 차트', '표시 21개, 차트 60개 이상'], ['불변 조건', '읽을 때 기본값과 합친다']]
  const widths = percents(contentColWidths(['항목', '내용'], rows))
  assert.ok(widths[0] >= 18 && widths[0] <= 28, `라벨 열 ${widths[0]}%`)
  assert.ok((widths[0] / 100) * 666 >= 177, `라벨 열 ${widths[0]}%`)
  const short = percents(contentColWidths(['항목', '내용'], [['책임', '설명 '.repeat(60)], ['관계', '설명 '.repeat(40)]]))
  assert.equal(short[0], 18, '짧은 라벨만 있으면 하한 18%')
})

test('숫자만 있는 첫 열은 라벨 하한(18%)을 받지 않는다', () => {
  const widths = percents(contentColWidths(['단계', '설명'], [['1', '설명 '.repeat(50)], ['2', '설명 '.repeat(30)]]))
  assert.ok(widths[0] < 10, `단계 열 ${widths[0]}%`)
})

test('짧은 칸이 모두인 열은 필요한 폭보다 넓어지지 않는다(남는 폭은 긴 글 열로)', () => {
  const widths = percents(contentColWidths(['필드', '값', '설명'], [['보기 방식', '<code>grid</code>', '설명 '.repeat(50)], ['분할', '<code>h</code>', '설명 '.repeat(30)]]))
  assert.ok(widths[0] < 16 && widths[1] < 10 && widths[2] > 70, widths.join(','))
})

test('낱말이 다 들어가지 않는 넓은 표: 가장 넓은 열부터 깎아 숫자 · 짧은 ID 열 폭을 지킨다', () => {
  const path = '<code>apps/server/src/routes/runtime/pages-long.ts</code>'
  const widths = percents(contentColWidths(['순번', '키', '경로 1', '경로 2', '경로 3'], [['12', 'PK', path, path, path]]))
  assert.ok((widths[0] / 100) * 666 >= 2 * 7 + 22 - 0.5, `순번 열 ${widths[0]}%`)
  assert.ok((widths[1] / 100) * 666 >= 2 * 7 + 22 - 0.5, `키 열 ${widths[1]}%`)
  assert.ok(Math.abs(widths[2] - widths[3]) < 0.2 && widths[2] > widths[0], widths.join(','))
  assert.ok(Math.abs(total(widths) - 100) < 0.5)
})

const tableSpec = (block) => ({ title: '표', chapters: [{ no: '1', title: '장', sections: [{ no: '1.1', title: '절', blocks: [block] }] }] })
const bodyTable = (html) => html.split('<div class="bsechead"')[1]

test('tableColWidths 를 켜지 않으면 표에 colgroup 이 없고, 켜면 내용 폭 colgroup 이 붙고, 표의 widths 가 먼저다', () => {
  const block = { t: 'table', head: ['단계', '설명'], rows: [['1', '긴 설명 문장']] }
  const plain = renderPrintHtml(tableSpec(block), { settings: variantSettings('plain') })
  assert.ok(bodyTable(plain).includes('<table class="btbl"><thead>'))
  const content = renderPrintHtml(tableSpec(block), { settings: variantSettings('options') })
  assert.match(bodyTable(content), /<colgroup><col style="width:[\d.]+%"><col style="width:[\d.]+%"><\/colgroup>/)
  const fixed = renderPrintHtml(tableSpec({ ...block, widths: ['30%', '70%'] }), { settings: variantSettings('plain') })
  assert.ok(bodyTable(fixed).includes('<colgroup><col style="width:30%"><col style="width:70%"></colgroup>'))
})

test('작은 예시 표(compact)는 폭을 열 수에 맞추고 내용 폭을 재지 않는다', () => {
  const html = renderPrintHtml(tableSpec({ t: 'table', head: ['a', 'b', 'c'], rows: [['1', '2', '3']], compact: true }), { settings: variantSettings('options') })
  assert.ok(bodyTable(html).includes('<table class="btbl bcompact" style="width:60%"><thead>'))
})
