// 링크 목적지 읽기 — 배열 · 이름 · 문자열로 적힌 목적지를 쪽 번호(0 부터)로 바꾼다.
// 부르는 곳: pdf/inspect.mjs.
// 먼저 읽을 파일: 없음(PDF 사양의 /Dest, /Dests, /Names 규칙만 따른다).
import { PDFArray, PDFDict, PDFHexString, PDFName, PDFRef, PDFString } from 'pdf-lib'

const name = (value) => PDFName.of(value)

function nameKey(object) {
  if (object instanceof PDFName) return object.asString().slice(1)
  if (object instanceof PDFString || object instanceof PDFHexString) return object.decodeText()
  return null
}

/** 이름 트리(/Names)에서 key 의 값을 찾는다. 못 찾으면 undefined. */
function findInNameTree(node, key) {
  const pairs = node.lookupMaybe(name('Names'), PDFArray)
  for (let index = 0; pairs && index < pairs.size(); index += 2) {
    if (nameKey(pairs.lookup(index)) === key) return pairs.get(index + 1)
  }
  const kids = node.lookupMaybe(name('Kids'), PDFArray)
  for (let index = 0; kids && index < kids.size(); index += 1) {
    const found = findInNameTree(kids.lookup(index, PDFDict), key)
    if (found) return found
  }
  return undefined
}

/** 이름 대상 하나를 찾는다. 옛 방식(/Dests 사전)과 이름 트리(/Names /Dests)를 모두 본다. */
function lookupNamedDestination(doc, key) {
  const legacy = doc.catalog.lookupMaybe(name('Dests'), PDFDict)?.get(name(key))
  if (legacy) return legacy
  const tree = doc.catalog.lookupMaybe(name('Names'), PDFDict)?.lookupMaybe(name('Dests'), PDFDict)
  return tree ? findInNameTree(tree, key) : undefined
}

/**
 * 목적지 → 쪽 번호 변환기를 만든다. pageOf(target) 은 못 찾으면 -1 을 돌려준다.
 * 쪽 참조는 문서 안에서 한 번만 표로 만들어 큰 문서에서도 빠르다.
 */
export function createPageResolver(doc) {
  const indexByRef = new Map(doc.getPages().map((page, index) => [page.ref.toString(), index]))
  const pageOfArray = (array) => {
    const first = array.get(0)
    return first instanceof PDFRef ? (indexByRef.get(first.toString()) ?? -1) : -1
  }
  const pageOf = (target) => {
    let resolved = target instanceof PDFRef ? doc.context.lookup(target) : target
    const key = nameKey(resolved)
    if (key !== null) {
      const found = lookupNamedDestination(doc, key)
      if (!found) return -1
      resolved = found instanceof PDFRef ? doc.context.lookup(found) : found
      if (resolved instanceof PDFDict) resolved = resolved.lookup(name('D'))
    }
    return resolved instanceof PDFArray ? pageOfArray(resolved) : -1
  }
  return { pageOf }
}
