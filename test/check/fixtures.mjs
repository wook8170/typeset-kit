// 검사 시험용 합성 PDF — 표지 · 문서 정보 · 차례 · 본문으로 된 책 한 권을 pdf-lib 로 만든다.
// 부르는 곳: test/check/*.test.mjs.
// 먼저 읽을 파일: src/pdf/nav.mjs(탐색 정보를 붙이는 쪽).
import { PDFDocument, PDFName } from 'pdf-lib'
import { applyPdfNavBytes } from '../../src/pdf/nav.mjs'

export const BOOK_OUTLINE = [
  { title: '문서 정보', pageIndex: 1, children: [] },
  { title: '목차', pageIndex: 2, children: [] },
  { title: '1. 첫 장', pageIndex: 3, children: [{ title: '첫 절', pageIndex: 4, children: [] }] },
  { title: '2. 둘째 장', pageIndex: 6, children: [] },
]
export const BOOK_LINKS = [
  { pageIndex: 2, rect: [48, 700, 550, 720], targetPageIndex: 3 },
  { pageIndex: 2, rect: [48, 680, 550, 700], targetPageIndex: 4 },
  { pageIndex: 2, rect: [48, 660, 550, 680], targetPageIndex: 6 },
]
export const BOOK_LABELS = [{ start: 0, prefix: '표지' }, { start: 1, style: 'r' }, { start: 3, style: 'D' }]

export async function blankBytes(pageCount = 8, { landscape = [] } = {}) {
  const doc = await PDFDocument.create()
  for (let index = 0; index < pageCount; index += 1) doc.addPage(landscape.includes(index) ? [842, 595] : [595, 842])
  return doc.save({ useObjectStreams: false })
}

/** 차례 · 책갈피 · 링크 · 쪽 번호 표기가 모두 맞는 책. overrides 로 한 군데씩 틀어 본다. */
export async function bookBytes(overrides = {}) {
  const options = { outline: BOOK_OUTLINE, links: BOOK_LINKS, pageLabels: BOOK_LABELS, ...overrides }
  return (await applyPdfNavBytes(await blankBytes(), options)).bytes
}

/** 첫 쪽 자원에 Type 3 글꼴 하나를 단 PDF. */
export async function type3Bytes() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  const font = doc.context.register(doc.context.obj({ Type: 'Font', Subtype: 'Type3' }))
  page.node.set(PDFName.of('Resources'), doc.context.obj({ Font: { F1: font } }))
  return (await applyPdfNavBytes(await doc.save(), { outline: [{ title: '쪽', pageIndex: 0, children: [] }] })).bytes
}
