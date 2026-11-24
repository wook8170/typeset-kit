// 쪽 나누기 스크립트 단위 테스트 — 선택 사항이 켤 때만 코드를 더하는지, 만든 스크립트가 문법에 맞는지, 쪽 크롬 CSS.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/render/paginator.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pageChromeCss, paginatorScript, roman } from '../../src/render/paginator.mjs'
import { MONO, SANS } from '../../src/theme/index.mjs'

test('앞붙임 쪽 번호는 로마 숫자다', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9, 10, 14, 19, 39].map(roman), ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'ix', 'x', 'xiv', 'xix', 'xxxix'])
})

test('선택 사항이 없으면 빈자리 채우기 · 절 목록 분할 · 가로 쪽 코드가 없고, 켜면 그 코드만 더해진다', () => {
  const base = paginatorScript()
  assert.equal(paginatorScript({}), base)
  assert.equal(paginatorScript({ fillSplitRows: 0 }), base)
  for (const word of ['fillSplit', 'copsecs', 'isLand', 'markCont', 'applyHead', 'bsbdesc']) assert.ok(!base.includes(word), word)
  const on = paginatorScript({ fillSplitRows: 3, splitSectionList: true })
  assert.ok(on.includes('function fillSplit(el)') && on.includes('ftb.rows.length < 3') && on.includes("contains('copsecs')"))
  const land = paginatorScript({ landscape: true })
  assert.ok(land.includes('var wantLand = isLand(it) || landLead(i);'))
  assert.ok(land.includes('if (cur && !!cur.land !== wantLand) cur = null;'), '가로 · 세로가 바뀌면 새 쪽')
  assert.ok(paginatorScript({ contMark: true }).includes('function markCont(c)'))
})

test('만든 스크립트는 선택 사항 조합마다 문법에 맞는다', () => {
  const combos = [{}, { fillSplitRows: 3 }, { landscape: true, contMark: true }, { splitSectionList: true, storyboard: true, onDone: 'window.__x = 1;' }]
  for (const opts of combos) assert.doesNotThrow(() => new Function(paginatorScript(opts)), JSON.stringify(opts))
})

test('applyHead 를 주면 절 제목 뒤 머리글을 그 함수로 칠하고, 주지 않으면 머리글 오른쪽 글자를 바꾼다', () => {
  const custom = paginatorScript({ applyHead: '  function applyHead(page, head){ page.page.title = head; }' })
  assert.ok(custom.includes('function applyHead(page, head)') && custom.includes('applyHead(pages[pi], running);'))
  assert.ok(!custom.includes(".phead .r').textContent = running"))
  assert.ok(paginatorScript().includes(".querySelector('.phead .r').textContent = running;"))
})

test('오류 문구는 영어다(라이브러리 오류 규칙)', () => {
  const script = paginatorScript()
  assert.ok(script.includes("'Typesetting did not converge ('"))
  assert.ok(!/[가-힣]/.test(script.replace(/\/\/[^\n]*/g, '')), '주석 밖에 한글이 없다')
})

test('쪽 크롬 CSS: 기본은 A4 세로 · 기본 글꼴 · 낱말 단위 줄바꿈, 선택 사항으로 가로 · 글꼴 · 줄바꿈을 바꾼다', () => {
  const css = pageChromeCss('#123')
  assert.ok(css.includes('@page{size:210mm 297mm;margin:0}') && css.includes(`font-family:${SANS}`) && css.includes('word-break:keep-all'))
  assert.ok(css.includes(`.pfoot .n{font-family:${MONO}}`) && css.includes('background:#123'))
  assert.ok(css.includes('#flow{position:absolute;left:-10000px;top:0;width:674px'))
  const land = pageChromeCss('#123', { landscape: true, fonts: { sans: "'A',sans-serif", mono: "'B',monospace" }, wordBreak: 'normal' })
  assert.ok(land.includes('@page{size:297mm 210mm;margin:0}') && land.includes('width:1027px') && land.includes('left:48px;right:48px'))
  assert.ok(land.includes("font-family:'A',sans-serif") && land.includes("font-family:'B',monospace") && land.includes('word-break:normal'))
})
