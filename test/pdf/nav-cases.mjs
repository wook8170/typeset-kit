// PDF 후처리 특성화 사례 — 옮기기 전 원천 코드와 옮긴 뒤 코드가 같은 사례를 같은 기대값으로 통과해야 한다.
// 부르는 곳: test/pdf/nav.test.mjs(옮긴 코드), 옮기기 전 확인용 임시 실행기.
// 먼저 읽을 파일: src/pdf/nav.mjs.
import assert from 'node:assert/strict'
import { PDFDocument, PDFName } from 'pdf-lib'
import { inspectPdf } from '../../src/pdf/inspect.mjs'

async function blankPdf(pageCount) {
  const doc = await PDFDocument.create()
  for (let index = 0; index < pageCount; index += 1) doc.addPage([595, 842])
  return doc.save({ useObjectStreams: false })
}

const OUTLINE = [
  { title: '목차', pageIndex: 2, children: [] },
  { title: '1. 첫 장', pageIndex: 3, children: [{ title: '첫 절', pageIndex: 4, children: [] }] },
  { title: '2. 둘째 장', pageIndex: 6, children: [] },
]
const LINKS = [
  { pageIndex: 2, rect: [48, 700, 550, 720], targetPageIndex: 3 },
  { pageIndex: 2, rect: [48, 680, 550, 700], targetPageIndex: 4 },
  { pageIndex: 2, rect: [48, 660, 550, 680], targetPageIndex: 6 },
]
const LABELS = [{ start: 0, prefix: '표지' }, { start: 1, style: 'r' }, { start: 3, style: 'D' }]

/** writer = { applyPdfNavBytes } 를 받아 사례를 돌린다. */
export const navCases = {
  '책갈피 · 링크 · 쪽 번호 표기를 쓰고 두 번 돌려도 같다': async ({ applyPdfNavBytes }) => {
    const options = { outline: OUTLINE, links: LINKS, pageLabels: LABELS }
    const once = await applyPdfNavBytes(await blankPdf(8), options)
    const twice = await applyPdfNavBytes(once.bytes, options)
    const info = await inspectPdf(twice.bytes)
    assert.deepEqual(info.outline, [
      { depth: 0, title: '목차', page: 2 },
      { depth: 0, title: '1. 첫 장', page: 3 },
      { depth: 1, title: '첫 절', page: 4 },
      { depth: 0, title: '2. 둘째 장', page: 6 },
    ])
    assert.deepEqual(info.links.map((link) => link.page), [3, 4, 6], '링크가 두 번 쌓이지 않는다')
    assert.deepEqual(info.pageLabels, ['표지', 'i', 'ii', '1', '2', '3', '4', '5'])
    assert.equal(info.pageMode, '/UseOutlines')
    assert.equal(twice.pages, 8)
  },

  '옵션이 없으면 있던 책갈피와 링크를 그대로 두고 책갈피 창만 연다': async ({ applyPdfNavBytes }) => {
    const first = await applyPdfNavBytes(await blankPdf(5), { outline: OUTLINE.slice(0, 2), links: LINKS.slice(0, 1) })
    const again = await applyPdfNavBytes(first.bytes)
    const info = await inspectPdf(again.bytes)
    assert.equal(info.outline.length, 3)
    assert.equal(info.links.length, 1)
    assert.equal(info.pageMode, '/UseOutlines')
    assert.equal(info.pageLabels, null)
  },

  '쪽 범위를 벗어난 목적지는 처음이나 끝 쪽으로 맞춘다': async ({ applyPdfNavBytes }) => {
    const out = await applyPdfNavBytes(await blankPdf(3), {
      outline: [{ title: '앞', pageIndex: -4, children: [] }, { title: '뒤', pageIndex: 99, children: [] }],
    })
    assert.deepEqual((await inspectPdf(out.bytes)).outline.map((item) => item.page), [0, 2])
  },

  '빈 책갈피 목록은 책갈피를 비운다': async ({ applyPdfNavBytes }) => {
    const filled = await applyPdfNavBytes(await blankPdf(3), { outline: OUTLINE.slice(0, 1) })
    const emptied = await applyPdfNavBytes(filled.bytes, { outline: [] })
    assert.deepEqual((await inspectPdf(emptied.bytes)).outline, [])
  },

  '객체 스트림 저장은 내용을 그대로 두고 파일을 줄인다': async ({ applyPdfNavBytes }) => {
    const doc = await PDFDocument.create()
    for (let index = 0; index < 5; index += 1) doc.addPage([595, 842])
    const kids = []
    for (let index = 0; index < 3000; index += 1) {
      kids.push(doc.context.register(doc.context.obj({ Type: 'StructElem', S: 'P', Alt: `node${String(index).padStart(8, '0')}` })))
    }
    doc.catalog.set(PDFName.of('StructTreeRoot'), doc.context.obj({ Type: 'StructTreeRoot', K: kids }))
    const input = await doc.save({ useObjectStreams: false })
    const labels = [{ start: 0, prefix: '표지' }, { start: 1, style: 'r' }, { start: 2, style: 'D' }]
    const plain = await applyPdfNavBytes(input, { pageLabels: labels })
    const packed = await applyPdfNavBytes(input, { pageLabels: labels, objectStreams: true })
    const text = (bytes) => Buffer.from(bytes).toString('latin1')
    assert.ok(!text(plain.bytes).includes('/ObjStm'), '옵션이 없으면 객체 스트림을 쓰지 않는다')
    assert.ok(text(packed.bytes).includes('/ObjStm'))
    assert.ok(packed.bytes.length < plain.bytes.length / 2, `작아져야 한다: ${packed.bytes.length} / ${plain.bytes.length}`)
    const back = await PDFDocument.load(packed.bytes)
    assert.equal(back.getPageCount(), 5)
    assert.equal(back.catalog.get(PDFName.of('PageMode')).toString(), '/UseOutlines')
    assert.ok(back.catalog.get(PDFName.of('PageLabels')))
    const root = back.context.lookup(back.catalog.get(PDFName.of('StructTreeRoot')))
    assert.equal(back.context.lookup(root.get(PDFName.of('K'))).size(), 3000)
  },
}
