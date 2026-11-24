// book 모드 — Markdown 원고 파일들(과 개정 이력 JSON)을 읽어 책 명세로 바꾼 뒤 spec 모드의 굽기(buildSpec)에 넘긴다.
// 부르는 곳: build/index.mjs(문서의 mode 가 book 일 때, stages.mjs 의 mode:book).
// 먼저 읽을 파일: input/markdown.mjs(변환 규칙), modes/spec.mjs(buildSpec · 조판 보고).

import { existsSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { mergeParts, parseMarkdown } from '../input/markdown.mjs'
import { inlineMarkdown } from '../input/markdown-inline.mjs'
import { readTextFile, toPosixPath } from '../platform.mjs'
import { localeWords } from '../render/locale/index.mjs'
import { buildSpec } from './spec.mjs'

function emptyReport(document, problems) {
  return {
    id: document.id, mode: document.mode, files: { pdf: null, printHtml: null, web: null },
    pages: null, frontPages: null, landscapePages: null, overflow: [], bookmarks: null, links: null,
    bytes: null, browser: null, problems,
  }
}

const isTextRow = (row, length) => Array.isArray(row) && row.length === length && row.every((cell) => typeof cell === 'string')
const isRowList = (rows, length) => Array.isArray(rows) && rows.every((row) => isTextRow(row, length))

/** 문서 정보 묶음의 꼴 위반(순수 함수). 없으면 null, 있으면 영어 설명 한 줄이다. */
export function docInfoProblem(info) {
  if (!isRowList(info.revisions, 4)) return 'revisions must be a list of [version, date, change, author] rows of strings'
  if (info.readers !== undefined && !isTextRow(info.readers, info.readers?.length)) return 'readers must be a list of strings'
  if (info.related !== undefined && !isRowList(info.related, 3)) return 'related must be a list of [number, name, relation] rows of strings'
  if (info.contact !== undefined && !isRowList(info.contact, 2)) return 'contact must be a list of [label, value] rows of strings'
  return null
}

/**
 * 개정 이력 JSON → 문서 정보(계약 4.1절 docInfo). 두 꼴을 받는다.
 *   - 목록: [[버전, YYYY-MM-DD, 변경 내용, 작성], …] → { revisions }
 *   - 객체: { revisions, readers, related, contact }
 * 렌더가 마크업으로 넣는 칸(변경 내용 · 독자 · 관계 · 문의 값)은 Markdown 인라인 문법으로 읽는다.
 * book 모드의 글은 원고든 옆 파일이든 같은 규칙으로 읽기 위해서다(작성자가 쓴 HTML 은 글자로 보인다).
 */
export function docInfoFrom(value) {
  const info = Array.isArray(value) ? { revisions: value } : value
  if (!info || typeof info !== 'object') throw new Error('revisions file must be a list of rows or an object with a revisions list')
  const problem = docInfoProblem(info)
  if (problem) throw new Error(`revisions file: ${problem}`)
  return {
    revisions: info.revisions.map(([version, date, change, author]) => [version, date, inlineMarkdown(change), author]),
    ...(info.readers ? { readers: info.readers.map(inlineMarkdown) } : {}),
    ...(info.related ? { related: info.related.map(([number, name, relation]) => [number, name, inlineMarkdown(relation)]) } : {}),
    ...(info.contact ? { contact: info.contact.map(([label, contactValue]) => [label, inlineMarkdown(contactValue)]) } : {}),
  }
}

/** 콜아웃 종류 → 인용문 첫 낱말로 쓸 수 있는 이름. 언어 묶음의 표시 낱말과 설정에 더한 종류의 키다. */
export function calloutNames(settings) {
  const words = localeWords(settings.locale).callouts
  const extra = Object.fromEntries(Object.keys(settings.theme.callouts).map((kind) => [kind, words[kind] ?? kind]))
  return { ...words, ...extra }
}

async function readParts(job, sources, kindNames) {
  const parts = []
  for (const source of sources) {
    const file = resolve(job.root, source)
    const imageBase = toPosixPath(relative(job.root, dirname(file))) || '.'
    parts.push(parseMarkdown(await readTextFile(file), { file: source, imageBase, kindNames }))
  }
  return parts
}

/** 모드 모듈 진입점. 원고나 개정 이력 파일이 없으면 굽지 않고 missing-file 로 알린다. */
export async function buildDocument(job, deps = {}) {
  const { document, root, settings } = job
  const sources = [document.src].flat()
  const missing = [...sources, ...(document.revisions ? [document.revisions] : [])].filter((source) => !existsSync(resolve(root, source)))
  if (missing.length) return emptyReport(document, missing.map((source) => `missing-file: ${source}`))
  const parts = await readParts(job, sources, calloutNames(settings))
  const docInfo = document.revisions ? docInfoFrom(JSON.parse(await readTextFile(resolve(root, document.revisions)))) : undefined
  const spec = mergeParts(parts, { title: document.title, docInfo, file: sources[0] })
  return buildSpec(job, spec, deps)
}
