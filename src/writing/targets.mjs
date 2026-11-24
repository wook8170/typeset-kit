// 검사 대상 파일 모으기 — 설정의 문서(src)와 writing.globs 에서 파일을 모으고 원고 종류를 붙인다.
// 부르는 곳: writing/index.mjs.
// 먼저 읽을 파일: docs/contract.md 「설정 계약」(documents[].src · writing.globs).
import { existsSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { expandGlob, isGlob } from './glob.mjs'

/** 문서 모드 → 원고 종류. */
const KIND_BY_MODE = { book: 'markdown', spec: 'spec', pages: 'html' }
const KIND_BY_EXTENSION = { '.html': 'html', '.htm': 'html' }

const asList = (value) => (Array.isArray(value) ? value : [value])

function filesOfSource(root, pattern) {
  if (isGlob(pattern)) return expandGlob(root, pattern)
  if (!existsSync(resolve(root, pattern))) throw new Error(`Writing check: source file not found: ${pattern}`)
  return [pattern.replaceAll('\\', '/')]
}

/**
 * 검사 대상 [{ file, kind }] (file 은 root 기준 `/` 경로, kind 는 markdown · spec · html).
 * `writing: false` 인 문서는 뺀다. 같은 파일이 여러 번 나오면 문서가 정한 종류가 먼저다.
 */
export function collectTargets({ root, config }) {
  const kinds = new Map()
  for (const document of config.documents) {
    if (document.writing === false) continue
    for (const pattern of asList(document.src)) {
      for (const file of filesOfSource(root, pattern)) if (!kinds.has(file)) kinds.set(file, KIND_BY_MODE[document.mode])
    }
  }
  for (const pattern of config.writing?.globs ?? []) {
    for (const file of expandGlob(root, pattern)) if (!kinds.has(file)) kinds.set(file, KIND_BY_EXTENSION[extname(file).toLowerCase()] ?? 'markdown')
  }
  return [...kinds].map(([file, kind]) => ({ file, kind })).sort((left, right) => left.file.localeCompare(right.file))
}
