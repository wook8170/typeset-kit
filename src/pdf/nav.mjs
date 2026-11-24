// PDF 탐색 정보 쓰기 — 구워진 PDF 에 책갈피 · 차례 링크 · 쪽 번호 표기 · 책갈피 창 설정을 붙인다.
// 부르는 곳: pdf/index.mjs(공개 내보내기), modes/*(굽고 난 뒤 후처리).
// 먼저 읽을 파일: docs/contract.md 「쪽 나누기 스크립트가 알리는 값」, pdf/inspect.mjs(같은 정보를 읽는 쪽).
import { readFile, writeFile } from 'node:fs/promises'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber } from 'pdf-lib'

/** 이 모듈이 단 링크 주석에만 찍는 표식. 다시 처리할 때 이 표식이 있는 링크만 갈아 끼운다. */
const LINK_MARK = PDFName.of('TypesetKitNav')

function clampPageIndex(pages, index) {
  return Math.min(Math.max(index, 0), pages.length - 1)
}

/** 쪽 맨 위로 가는 목적지 배열. */
function pageTop(doc, pages, index) {
  const page = pages[clampPageIndex(pages, index)]
  return doc.context.obj([page.ref, PDFName.of('XYZ'), PDFNumber.of(0), PDFNumber.of(page.getHeight()), PDFNumber.of(0)])
}

function outlineItem(doc, pages, item, links) {
  const dict = doc.context.obj({})
  dict.set(PDFName.of('Title'), PDFHexString.fromText(item.title))
  dict.set(PDFName.of('Parent'), links.parent)
  dict.set(PDFName.of('Dest'), pageTop(doc, pages, item.pageIndex))
  if (links.prev) dict.set(PDFName.of('Prev'), links.prev)
  if (links.next) dict.set(PDFName.of('Next'), links.next)
  return dict
}

/** 형제 묶음을 쓰고 [첫 항목, 끝 항목, 보이는 항목 수] 를 돌려준다. 하위 항목은 펼친 상태(Count 양수)로 둔다. */
function writeOutlineLevel(doc, pages, items, parentRef) {
  const refs = items.map(() => doc.context.nextRef())
  let visible = 0
  items.forEach((item, index) => {
    const dict = outlineItem(doc, pages, item, { parent: parentRef, prev: refs[index - 1], next: refs[index + 1] })
    if (item.children?.length) {
      const [first, last, count] = writeOutlineLevel(doc, pages, item.children, refs[index])
      dict.set(PDFName.of('First'), first)
      dict.set(PDFName.of('Last'), last)
      dict.set(PDFName.of('Count'), PDFNumber.of(count))
      visible += count
    }
    visible += 1
    doc.context.assign(refs[index], dict)
  })
  return [refs[0], refs[refs.length - 1], visible]
}

/** 책갈피 트리를 문서에 쓴다. 있던 책갈피는 갈아 끼운다. */
function writeOutline(doc, tree) {
  const pages = doc.getPages()
  const rootRef = doc.context.nextRef()
  const root = doc.context.obj({ Type: 'Outlines' })
  if (tree.length > 0) {
    const [first, last, count] = writeOutlineLevel(doc, pages, tree, rootRef)
    root.set(PDFName.of('First'), first)
    root.set(PDFName.of('Last'), last)
    root.set(PDFName.of('Count'), PDFNumber.of(count))
  }
  doc.context.assign(rootRef, root)
  doc.catalog.set(PDFName.of('Outlines'), rootRef)
}

function removeOwnLinks(doc) {
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    if (!annots) continue
    const kept = annots.asArray().filter((ref) => !doc.context.lookup(ref, PDFDict).get(LINK_MARK))
    page.node.set(PDFName.of('Annots'), doc.context.obj(kept))
  }
}

function appendAnnotation(doc, page, annotation) {
  const ref = doc.context.register(annotation)
  const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
  if (annots) annots.push(ref)
  else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]))
}

/** 줄마다 해당 쪽으로 가는 링크 주석을 단다. 이 모듈이 전에 단 링크는 먼저 지운다. */
function writeLinks(doc, links) {
  const pages = doc.getPages()
  removeOwnLinks(doc)
  for (const link of links) {
    const annotation = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: link.rect.map((value) => Math.round(value * 100) / 100),
      Border: [0, 0, 0],
      Dest: pageTop(doc, pages, link.targetPageIndex),
    })
    annotation.set(LINK_MARK, doc.context.obj(true))
    appendAnnotation(doc, pages[link.pageIndex], annotation)
  }
}

/** 쪽 번호 표기(/PageLabels). ranges = [{ start, style?: 'r' | 'D', prefix? }], start 는 0 부터 센 물리 쪽이다. */
function writePageLabels(doc, ranges) {
  const nums = []
  for (const range of ranges) {
    const dict = doc.context.obj({})
    if (range.style) dict.set(PDFName.of('S'), PDFName.of(range.style))
    if (range.prefix) dict.set(PDFName.of('P'), PDFHexString.fromText(range.prefix))
    nums.push(PDFNumber.of(range.start), dict)
  }
  doc.catalog.set(PDFName.of('PageLabels'), doc.context.obj({ Nums: nums }))
}

/**
 * 바이트를 받아 탐색 정보를 붙인 바이트를 돌려준다. 돌려주는 값 = { bytes, pages }.
 * options.outline: 책갈피 트리 [{ title, pageIndex, children }]. 없으면 있던 책갈피를 그대로 둔다.
 * options.links: [{ pageIndex, rect, targetPageIndex }]. options.pageLabels: 쪽 번호 표기 구간.
 * options.objectStreams: true 면 객체를 객체 스트림으로 묶어 저장한다(내용은 그대로이고 파일이 작아진다).
 * 열 때 책갈피 창을 펴도록 /PageMode 를 항상 /UseOutlines 로 둔다. 이미 처리한 PDF 를 다시 처리해도 결과가 같다.
 */
export async function applyPdfNavBytes(input, options = {}) {
  const doc = await PDFDocument.load(input, { updateMetadata: false })
  if (options.outline) writeOutline(doc, options.outline)
  if (options.links) writeLinks(doc, options.links)
  if (options.pageLabels) writePageLabels(doc, options.pageLabels)
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'))
  const bytes = await doc.save({ useObjectStreams: Boolean(options.objectStreams), updateFieldAppearances: false })
  return { bytes, pages: doc.getPageCount() }
}

/** 파일 판. PDF 파일을 읽어 탐색 정보를 붙여 같은 자리에 쓴다. 돌려주는 값은 쪽 수다. */
export async function applyPdfNav(pdfPath, options = {}) {
  const { bytes, pages } = await applyPdfNavBytes(await readFile(pdfPath), options)
  await writeFile(pdfPath, bytes)
  return pages
}
