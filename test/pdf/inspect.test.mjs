// PDF 읽기 시험 — 쪽 번호 표기 모양, 내부 · 바깥 링크, 가로 쪽, 이름 대상, 글꼴 종류.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/pdf/inspect.mjs, src/pdf/destinations.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { inspectPdf, isLandscapePage } from '../../src/pdf/inspect.mjs'
import { applyPdfNavBytes } from '../../src/pdf/nav.mjs'
import { blankBytes, type3Bytes } from '../check/fixtures.mjs'

test('쪽 번호 표기: 접두 · 로마 소문자 · 대문자 · 알파벳 · 시작 번호', async () => {
  const bytes = await blankBytes(9)
  const labeled = await applyPdfNavBytes(bytes, {
    pageLabels: [{ start: 0, prefix: '표지' }, { start: 1, style: 'r' }, { start: 3, style: 'R' }, { start: 5, style: 'a' }, { start: 7, style: 'D', prefix: 'A-' }],
  })
  assert.deepEqual((await inspectPdf(labeled.bytes)).pageLabels, ['표지', 'i', 'ii', 'I', 'II', 'a', 'b', 'A-1', 'A-2'])
})

test('쪽 번호 표기가 없으면 null 이다', async () => {
  assert.equal((await inspectPdf(await blankBytes(2))).pageLabels, null)
})

test('바깥 주소 링크와 쪽 안 링크를 가른다', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([595, 842])
  doc.addPage([595, 842])
  const uri = doc.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 5, 5], A: { S: 'URI', URI: PDFString.of('https://example.com') },
  })
  const inside = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 10, 5, 15], Dest: [doc.getPage(1).ref, 'Fit'] })
  doc.getPage(0).node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(uri), doc.context.register(inside)]))
  const { links } = await inspectPdf(await doc.save())
  assert.deepEqual(links.map(({ external, page }) => ({ external, page })), [{ external: true, page: null }, { external: false, page: 1 }])
})

test('이름 대상은 옛 /Dests 사전과 이름 트리 모두에서 찾는다', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([595, 842])
  doc.addPage([595, 842])
  const target = (index) => doc.context.obj([doc.getPage(index).ref, 'Fit'])
  doc.catalog.set(PDFName.of('Dests'), doc.context.obj({ legacy: target(1) }))
  doc.catalog.set(PDFName.of('Names'), doc.context.obj({ Dests: { Names: [PDFString.of('treeName'), target(1)] } }))
  const link = (dest) => doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 5, 5], Dest: dest }))
  doc.getPage(0).node.set(PDFName.of('Annots'), doc.context.obj([link(PDFName.of('legacy')), link(PDFString.of('treeName')), link(PDFName.of('absent'))]))
  assert.deepEqual((await inspectPdf(await doc.save())).links.map((item) => item.page), [1, 1, -1])
})

test('가로 쪽은 돌림 각도를 반영해 센다', async () => {
  assert.equal(isLandscapePage(842, 595, 0), true)
  assert.equal(isLandscapePage(842, 595, 90), false)
  assert.equal(isLandscapePage(595, 842, 270), true)
  assert.equal((await inspectPdf(await blankBytes(4, { landscape: [0, 3] }))).landscapePages, 2)
})

test('Type 3 글꼴은 쪽 자원에서 한 번만 센다', async () => {
  assert.equal((await inspectPdf(await type3Bytes())).type3Fonts, 1)
  assert.equal((await inspectPdf(await blankBytes(2))).type3Fonts, 0)
})

test('크기와 책갈피 창 설정을 돌려준다', async () => {
  const bytes = await blankBytes(2)
  const info = await inspectPdf(bytes)
  assert.equal(info.bytes, bytes.byteLength)
  assert.equal(info.pageMode, null)
  assert.equal((await inspectPdf((await applyPdfNavBytes(bytes)).bytes)).pageMode, '/UseOutlines')
})
