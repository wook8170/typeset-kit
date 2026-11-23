// 검사 규칙 시험 — 합성 PDF 를 한 군데씩 틀어 규칙이 문제 코드를 돌려주는지 본다.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/check/rules.mjs, test/check/fixtures.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkToc, findToc, summarizeLabels } from '../../src/check/rules.mjs'
import { inspectPdf } from '../../src/pdf/inspect.mjs'
import { BOOK_LINKS, BOOK_OUTLINE, bookBytes } from './fixtures.mjs'

const tocOf = async (overrides) => findToc(await inspectPdf(await bookBytes(overrides)))

test('차례 줄은 차례 쪽의 링크를 위에서 아래로 모은다', async () => {
  const toc = await tocOf()
  assert.equal(toc.tocPage, 2)
  assert.equal(toc.bodyStart, 3)
  assert.deepEqual(toc.lines.map((line) => line.page), [3, 4, 6])
  assert.deepEqual(toc.entries.map((entry) => entry.title), ['1. 첫 장', '첫 절', '2. 둘째 장'])
  assert.deepEqual(checkToc(toc), [])
})

test('링크 순서가 뒤섞여 들어와도 위에서 아래 순서로 읽는다', async () => {
  const toc = await tocOf({ links: [...BOOK_LINKS].reverse() })
  assert.deepEqual(toc.lines.map((line) => line.page), [3, 4, 6])
})

test('차례 줄이 책갈피보다 적으면 toc-count', async () => {
  const problems = checkToc(await tocOf({ links: BOOK_LINKS.slice(0, 2) }))
  assert.equal(problems.length, 1)
  assert.match(problems[0], /^toc-count: 2 table of contents links, 3 bookmarks/)
})

test('줄이 책갈피와 다른 쪽으로 가면 toc-target', async () => {
  const links = BOOK_LINKS.map((link, index) => (index === 1 ? { ...link, targetPageIndex: 5 } : link))
  const problems = checkToc(await tocOf({ links }))
  assert.equal(problems.length, 1)
  assert.match(problems[0], /^toc-target: "첫 절" bookmark opens page 5, its table of contents link opens page 6/)
})

test('목적지 쪽이 앞 줄보다 앞서면 toc-order', async () => {
  const pages = [3, 6, 4]
  const outline = [BOOK_OUTLINE[0], BOOK_OUTLINE[1], ...pages.map((pageIndex, index) => ({ title: `장 ${index + 1}`, pageIndex, children: [] }))]
  const links = pages.map((targetPageIndex, index) => ({ pageIndex: 2, rect: [48, 700 - index * 20, 550, 720 - index * 20], targetPageIndex }))
  const problems = checkToc(await tocOf({ outline, links }))
  assert.deepEqual(problems.map((problem) => problem.split(':')[0]), ['toc-order'])
})

test('차례 항목이 없으면 차례 규칙을 건너뛴다', async () => {
  assert.equal(await tocOf({ outline: [{ title: '면 1', pageIndex: 0, children: [] }] }), null)
  assert.deepEqual(checkToc(null), [])
})

test('차례 뒤에 책갈피가 없으면 toc-body', async () => {
  const toc = await tocOf({ outline: [{ title: '목차', pageIndex: 2, children: [] }], links: [] })
  assert.match(checkToc(toc)[0], /^toc-body:/)
})

test('쪽 번호 표기 요약은 같은 모양끼리 묶는다', () => {
  assert.deepEqual(summarizeLabels(['표지', 'i', 'ii', 'iii', '1', '2', '3']), ['표지', 'i-iii', '1-3'])
  assert.deepEqual(summarizeLabels(['표지', '목차 1', '목차 2', '1']), ['표지', '목차 1-목차 2', '1'])
  assert.equal(summarizeLabels(null), null)
})
