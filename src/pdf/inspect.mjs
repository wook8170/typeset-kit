// PDF 읽기 — 책갈피 · 링크 · 쪽 번호 표기 · 글꼴 종류 · 쪽 방향을 읽어 한 덩어리로 돌려준다.
// 부르는 곳: pdf/index.mjs(공개 내보내기), check/index.mjs(PDF 검사), 조판 모드(굽고 난 뒤 보고).
// 먼저 읽을 파일: pdf/destinations.mjs(링크 목적지를 쪽 번호로 바꾸는 쪽), docs/contract.md 「check 의 결과」.
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString } from 'pdf-lib'
import { createPageResolver } from './destinations.mjs'

const name = (value) => PDFName.of(value)

function decodeText(object) {
  return object instanceof PDFHexString || object instanceof PDFString ? object.decodeText() : ''
}

/** 책갈피를 위에서 아래 순서로 펼쳐 [{ depth, title, page }] 로 돌려준다. page 는 0 부터 센 쪽이고 못 찾으면 -1 이다. */
function readOutline(doc, resolver) {
  const root = doc.catalog.lookupMaybe(name('Outlines'), PDFDict)
  const first = root?.lookupMaybe(name('First'), PDFDict)
  const items = []
  const walk = (start, depth) => {
    for (let node = start; node; node = node.lookupMaybe(name('Next'), PDFDict)) {
      const target = node.get(name('Dest')) ?? node.lookupMaybe(name('A'), PDFDict)?.get(name('D'))
      items.push({ depth, title: decodeText(node.lookup(name('Title'))), page: resolver.pageOf(target) })
      const child = node.lookupMaybe(name('First'), PDFDict)
      if (child) walk(child, depth + 1)
    }
  }
  if (first) walk(first, 0)
  return items
}

function readRect(annotation) {
  const rect = annotation.lookupMaybe(name('Rect'), PDFArray)
  return rect ? rect.asArray().map((value) => value.asNumber()) : [0, 0, 0, 0]
}

/**
 * 링크 주석을 읽는다. 돌려주는 값 = [{ pageIndex, rect, page, external }].
 * 쪽 안으로 가는 링크는 page 에 목적지 쪽(못 찾으면 -1)을, 바깥 주소로 가는 링크는 external 을 참으로 둔다.
 */
function readLinks(doc, resolver) {
  const links = []
  doc.getPages().forEach((page, pageIndex) => {
    const annots = page.node.lookupMaybe(name('Annots'), PDFArray)
    for (const ref of annots?.asArray() ?? []) {
      const annotation = doc.context.lookup(ref)
      if (!(annotation instanceof PDFDict) || annotation.get(name('Subtype')) !== name('Link')) continue
      const action = annotation.lookupMaybe(name('A'), PDFDict)
      const external = action?.get(name('S')) === name('URI')
      const target = annotation.get(name('Dest')) ?? action?.get(name('D'))
      links.push({ pageIndex, rect: readRect(annotation), page: external ? null : resolver.pageOf(target), external })
    }
  })
  return links
}

const ROMAN = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]

function toRoman(number) {
  let rest = number
  let text = ''
  for (const [value, symbol] of ROMAN) {
    while (rest >= value) {
      text += symbol
      rest -= value
    }
  }
  return text
}

function toLetters(number, base) {
  let rest = number - 1
  let text = ''
  do {
    text = String.fromCharCode(base + (rest % 26)) + text
    rest = Math.floor(rest / 26) - 1
  } while (rest >= 0)
  return text
}

const STYLES = {
  D: (number) => String(number),
  r: toRoman,
  R: (number) => toRoman(number).toUpperCase(),
  a: (number) => toLetters(number, 97),
  A: (number) => toLetters(number, 65),
}

function readLabelRanges(doc) {
  const labels = doc.catalog.lookupMaybe(name('PageLabels'), PDFDict)
  const nums = labels?.lookupMaybe(name('Nums'), PDFArray)
  if (!nums) return null
  const ranges = []
  for (let index = 0; index < nums.size(); index += 2) {
    const dict = nums.lookup(index + 1, PDFDict)
    const style = dict.get(name('S'))
    ranges.push({
      start: nums.lookup(index, PDFNumber).asNumber(),
      style: style ? style.asString().slice(1) : null,
      prefix: decodeText(dict.lookup(name('P'))),
      first: dict.lookupMaybe(name('St'), PDFNumber)?.asNumber() ?? 1,
    })
  }
  return ranges
}

/** 쪽마다 뷰어에 보이는 쪽 번호 문자열을 돌려준다. 쪽 번호 표기가 없으면 null 이다. */
function readPageLabels(doc) {
  const ranges = readLabelRanges(doc)
  if (!ranges) return null
  return doc.getPages().map((_, index) => {
    const range = [...ranges].reverse().find((candidate) => candidate.start <= index)
    if (!range) return String(index + 1)
    const number = index - range.start + range.first
    return range.prefix + (range.style && STYLES[range.style] ? STYLES[range.style](number) : '')
  })
}

function fontsOf(resources) {
  const fonts = resources?.lookupMaybe(name('Font'), PDFDict)
  return fonts ? fonts.entries().map(([, value]) => value) : []
}

/** 쪽 · 그림 틀(XObject)의 자원에서 글꼴 사전을 모아, 같은 글꼴은 한 번만 세어 Type 3 개수를 돌려준다. */
function countType3Fonts(doc) {
  const seenFonts = new Set()
  const seenResources = new Set()
  let type3 = 0
  const visit = (resources) => {
    if (!resources) return
    for (const font of fontsOf(resources)) {
      const key = font instanceof PDFRef ? font.toString() : null
      if (key && seenFonts.has(key)) continue
      if (key) seenFonts.add(key)
      if (doc.context.lookup(font, PDFDict)?.get(name('Subtype')) === name('Type3')) type3 += 1
    }
    const xobjects = resources.lookupMaybe(name('XObject'), PDFDict)
    for (const [, value] of xobjects?.entries() ?? []) {
      const key = value instanceof PDFRef ? value.toString() : null
      if (key && seenResources.has(key)) continue
      if (key) seenResources.add(key)
      const stream = doc.context.lookup(value)
      if (stream?.dict?.get(name('Subtype')) === name('Form')) visit(stream.dict.lookupMaybe(name('Resources'), PDFDict))
    }
  }
  for (const page of doc.getPages()) visit(page.node.Resources())
  return type3
}

/** 쪽이 가로인지(돌림 각도를 반영해 폭이 높이보다 큰지) 판정한다. */
export function isLandscapePage(width, height, rotation) {
  return rotation % 180 === 0 ? width > height : height > width
}

function countLandscapePages(doc) {
  return doc.getPages().filter((page) => {
    const { width, height } = page.getSize()
    return isLandscapePage(width, height, page.getRotation().angle)
  }).length
}

/**
 * PDF 바이트를 읽어 탐색 정보를 돌려준다.
 * 돌려주는 값 = { pages, bytes, pageMode, outline, links, pageLabels, type3Fonts, landscapePages }.
 * outline 은 [{ depth, title, page }], links 는 [{ pageIndex, rect, page, external }], pageLabels 는 쪽마다 문자열(없으면 null)이다.
 */
export async function inspectPdf(input) {
  const doc = await PDFDocument.load(input, { updateMetadata: false })
  const resolver = createPageResolver(doc)
  return {
    pages: doc.getPageCount(),
    bytes: input.byteLength,
    pageMode: doc.catalog.get(name('PageMode'))?.toString() ?? null,
    outline: readOutline(doc, resolver),
    links: readLinks(doc, resolver),
    pageLabels: readPageLabels(doc),
    type3Fonts: countType3Fonts(doc),
    landscapePages: countLandscapePages(doc),
  }
}
