// PDF 합치기 — 여러 PDF 를 쪽 순서대로 한 권으로 잇는다. 외부 프로그램(poppler)을 부르지 않는다.
// 부르는 곳: pdf/index.mjs(공개 내보내기), modes/pages.mjs(면마다 구운 PDF 를 합칠 때).
// 먼저 읽을 파일: pdf/nav.mjs(합친 뒤 책갈피 · 쪽 번호 표기를 붙이는 쪽), pdf/destinations.mjs(링크 목적지 읽기).
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber } from 'pdf-lib'
import { createPageResolver } from './destinations.mjs'

const name = (value) => PDFName.of(value)

/**
 * 원본의 쪽 안 링크를 읽어 [{ pageIndex, rect, targetIndex }] 로 돌려주고, 원본에서는 떼어 낸다.
 * pdf-lib 가 링크의 목적지 쪽까지 통째로 복사해 쪽 한 벌이 더 생기기 때문에, 링크는 복사하지 않고 합본에서 새로 단다.
 * 바깥 주소로 가는 링크 같은 나머지 주석은 그대로 따라온다.
 */
function detachInternalLinks(source) {
  const resolver = createPageResolver(source)
  const links = []
  source.getPages().forEach((page, pageIndex) => {
    const annots = page.node.lookupMaybe(name('Annots'), PDFArray)
    if (!annots) return
    const kept = []
    for (const ref of annots.asArray()) {
      const annotation = source.context.lookup(ref)
      const isLink = annotation instanceof PDFDict && annotation.get(name('Subtype')) === name('Link')
      const action = isLink ? annotation.lookupMaybe(name('A'), PDFDict) : null
      const targetIndex = isLink && action?.get(name('S')) !== name('URI') ? resolver.pageOf(annotation.get(name('Dest')) ?? action?.get(name('D'))) : -1
      if (targetIndex < 0) {
        kept.push(ref)
        continue
      }
      const rect = annotation.lookup(name('Rect'), PDFArray).asArray().map((value) => value.asNumber())
      links.push({ pageIndex, rect, targetIndex })
    }
    page.node.set(name('Annots'), source.context.obj(kept))
  })
  return links
}

function attachLink(merged, start, link) {
  const target = merged.getPage(start + link.targetIndex)
  const annotation = merged.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: link.rect,
    Border: [0, 0, 0],
    Dest: [target.ref, name('XYZ'), PDFNumber.of(0), PDFNumber.of(target.getHeight()), PDFNumber.of(0)],
  })
  const page = merged.getPage(start + link.pageIndex)
  const annots = page.node.lookupMaybe(name('Annots'), PDFArray)
  const ref = merged.context.register(annotation)
  if (annots) annots.push(ref)
  else page.node.set(name('Annots'), merged.context.obj([ref]))
}

/**
 * 입력 PDF(바이트) 목록을 한 권으로 잇는다. 돌려주는 값 = { bytes, pages, starts }.
 * starts[i] 는 i 번째 입력이 합본에서 시작하는 쪽(0 부터)이다. 책갈피 목적지를 정할 때 쓴다.
 * 한 입력 안에서 쪽으로 가는 링크는 합본의 같은 쪽으로 이어진다(이름 대상도 같다). 입력 사이로 가는 링크는 만들지 않는다.
 */
export async function mergePdfs(inputs, { objectStreams = false } = {}) {
  if (inputs.length === 0) throw new Error('mergePdfs needs at least one input')
  const merged = await PDFDocument.create()
  const starts = []
  for (const input of inputs) {
    const source = await PDFDocument.load(input, { updateMetadata: false })
    const links = detachInternalLinks(source)
    const start = merged.getPageCount()
    starts.push(start)
    for (const page of await merged.copyPages(source, source.getPageIndices())) merged.addPage(page)
    for (const link of links) attachLink(merged, start, link)
  }
  const bytes = await merged.save({ useObjectStreams: objectStreams })
  return { bytes, pages: merged.getPageCount(), starts }
}
