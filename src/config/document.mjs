// 문서 고르기와 문서별 설정 — 굽을 문서를 고르고, 전역 설정에 문서의 덮어쓰기를 합쳐 렌더가 받을 설정 한 벌을 만든다.
// 부르는 곳: build/index.mjs(굽기 전), 조판 모드(modes/*)가 받는 settings 의 출처.
// 먼저 읽을 파일: docs/contract.md 「문서 설정(settings)」.

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** 덮어쓰기 합치기. 객체는 키마다 안으로 들어가 합치고, 배열과 값은 덮어쓰는 쪽으로 바꾼다. */
export function mergeOverride(base, override) {
  if (override === undefined) return structuredClone(base)
  if (!isPlainObject(base) || !isPlainObject(override)) return structuredClone(override)
  const merged = structuredClone(base)
  for (const [key, value] of Object.entries(override)) merged[key] = mergeOverride(base[key], value)
  return merged
}

/** 문서를 찾지 못했을 때의 오류. 쓸 수 있는 id 를 함께 알린다. */
export class UnknownDocumentError extends Error {
  constructor(unknownIds, knownIds) {
    super(`Unknown document id: ${unknownIds.join(', ')} (known: ${knownIds.join(', ') || 'none'})`)
    this.name = 'UnknownDocumentError'
    this.unknownIds = unknownIds
  }
}

/** 굽을 문서를 고른다(순수 함수). ids 가 비면 모두다. 없는 id 가 있으면 아무것도 굽지 않고 실패한다. */
export function selectDocuments(documents, ids = []) {
  if (ids.length === 0) return documents
  const knownIds = documents.map((document) => document.id)
  const unknownIds = ids.filter((id) => !knownIds.includes(id))
  if (unknownIds.length > 0) throw new UnknownDocumentError(unknownIds, knownIds)
  return documents.filter((document) => ids.includes(document.id))
}

/** 문서 하나의 설정 한 벌(settings). 렌더 · 조판 모드는 전역 설정을 직접 읽지 않고 이것만 받는다. */
export function documentSettings(config, document) {
  return {
    id: document.id,
    mode: document.mode,
    title: document.title,
    locale: config.locale,
    brand: structuredClone(config.brand),
    limits: structuredClone(config.limits),
    theme: mergeOverride(config.theme, document.theme),
    cover: mergeOverride(config.cover, document.cover),
    header: mergeOverride(config.header, document.header),
    footer: mergeOverride(config.footer, document.footer),
    typeset: mergeOverride(config.typeset, document.typeset),
  }
}
