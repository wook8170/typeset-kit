// PDF 합치기 시험 — 쪽 수 · 시작 쪽 · 링크 주석 · 입력 오류.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/pdf/merge.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { inspectPdf } from '../../src/pdf/inspect.mjs'
import { mergePdfs } from '../../src/pdf/merge.mjs'
import { applyPdfNavBytes } from '../../src/pdf/nav.mjs'
import { blankBytes } from '../check/fixtures.mjs'

test('입력 순서대로 이어 붙이고 입력마다 시작 쪽을 돌려준다', async () => {
  const merged = await mergePdfs([await blankBytes(2), await blankBytes(3), await blankBytes(1)])
  assert.equal(merged.pages, 6)
  assert.deepEqual(merged.starts, [0, 2, 5])
  assert.equal((await PDFDocument.load(merged.bytes)).getPageCount(), 6)
})

test('가로 쪽과 쪽 크기가 그대로 따라온다', async () => {
  const merged = await mergePdfs([await blankBytes(2, { landscape: [1] }), await blankBytes(2)])
  assert.equal((await inspectPdf(merged.bytes)).landscapePages, 1)
})

test('쪽 안의 링크 주석이 따라온다', async () => {
  const withLink = (await applyPdfNavBytes(await blankBytes(2), { links: [{ pageIndex: 0, rect: [1, 1, 20, 20], targetPageIndex: 1 }] })).bytes
  const merged = await mergePdfs([await blankBytes(1), withLink])
  const info = await inspectPdf(merged.bytes)
  assert.deepEqual(info.links.map((link) => ({ pageIndex: link.pageIndex, page: link.page })), [{ pageIndex: 1, page: 2 }])
})

test('뒤 입력의 링크는 합본의 시작 쪽만큼 밀려서 같은 쪽으로 이어지고, 쪽 객체가 늘지 않는다', async () => {
  const linked = (await applyPdfNavBytes(await blankBytes(2), { links: [{ pageIndex: 0, rect: [1, 1, 20, 20], targetPageIndex: 1 }] })).bytes
  const merged = await mergePdfs([linked, linked])
  const info = await inspectPdf(merged.bytes)
  assert.deepEqual(info.links.map((link) => [link.pageIndex, link.page]), [[0, 1], [2, 3]])
  const doc = await PDFDocument.load(merged.bytes)
  const pageObjects = doc.context.enumerateIndirectObjects().filter(([, object]) => object.get?.(PDFName.of('Type')) === PDFName.of('Page'))
  assert.equal(pageObjects.length, 4)
})

test('바깥 주소 링크는 그대로 따라온다', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([595, 842])
  const uri = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 5, 5], A: { S: 'URI', URI: PDFString.of('https://example.com') } })
  doc.getPage(0).node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(uri)]))
  const info = await inspectPdf((await mergePdfs([await doc.save()])).bytes)
  assert.deepEqual(info.links.map((link) => link.external), [true])
})

test('합친 뒤 책갈피를 시작 쪽에 맞춰 붙일 수 있다', async () => {
  const merged = await mergePdfs([await blankBytes(2), await blankBytes(2)])
  const outline = merged.starts.map((start, index) => ({ title: `면 ${index + 1}`, pageIndex: start, children: [] }))
  const info = await inspectPdf((await applyPdfNavBytes(merged.bytes, { outline })).bytes)
  assert.deepEqual(info.outline, [{ depth: 0, title: '면 1', page: 0 }, { depth: 0, title: '면 2', page: 2 }])
})

test('입력이 없으면 오류, PDF 가 아니면 오류', async () => {
  await assert.rejects(() => mergePdfs([]), /at least one input/)
  await assert.rejects(() => mergePdfs([Buffer.from('not a pdf')]))
})
