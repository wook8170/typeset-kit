// 설정 검증 — 읽은 설정 값을 스키마에 견주어 기본값을 채운 설정과 문제 목록을 돌려준다. 디스크를 만지지 않는 순수 함수다.
// 부르는 곳: config/load.mjs(파일을 읽은 뒤), cli/commands/init.mjs(만든 견본의 자체 점검), 테스트.
// 먼저 읽을 파일: config/schema.mjs(받는 키와 기본값).
import { CONFIG_SCHEMA, MODE_ONLY_KEYS } from './schema.mjs'

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const joinPath = (path, key) => (path ? `${path}.${key}` : String(key))
const describe = (value) => (typeof value === 'function' ? 'function' : (JSON.stringify(value)?.slice(0, 60) ?? String(value)))

function defaultOf(node) {
  if (node.kind === 'partial') return undefined
  if (node.kind !== 'record') return structuredClone(node.fallback)
  return Object.fromEntries(Object.entries(node.keys).map(([key, child]) => [key, defaultOf(child)]))
}

function wrongType(node, value, path, expected, problems) {
  problems.push({ path, code: 'wrong-type', expected, got: describe(value) })
  return defaultOf(node)
}

function checkKeys(node, value, path, problems) {
  const known = Object.keys(node.keys)
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) problems.push({ path: joinPath(path, key), code: 'unknown-key', expected: known.join(' | ') })
  }
  return known
}

function resolveRecord(node, value, path, problems) {
  if (!isPlainObject(value)) return wrongType(node, value, path, 'object', problems)
  const known = checkKeys(node, value, path, problems)
  for (const key of node.required) {
    if (value[key] === undefined) problems.push({ path: joinPath(path, key), code: 'missing-key' })
  }
  return Object.fromEntries(known.map((key) => [key, resolveNode(node.keys[key], value[key], joinPath(path, key), problems)]))
}

/** 덮어쓰기 묶음. 준 키만 남기고, 안쪽 묶음도 덮어쓰기로 다룬다. */
function resolvePartial({ node }, value, path, problems) {
  if (node.kind !== 'record') return resolveNode(node, value, path, problems)
  if (!isPlainObject(value)) return wrongType({ kind: 'partial' }, value, path, 'object', problems)
  const known = checkKeys(node, value, path, problems)
  const present = known.filter((key) => value[key] !== undefined)
  return Object.fromEntries(
    present.map((key) => {
      const child = node.keys[key]
      const asPartial = child.kind === 'record' ? { kind: 'partial', node: child } : child
      return [key, resolveNode(asPartial, value[key], joinPath(path, key), problems)]
    }),
  )
}

function resolveList(node, value, path, problems) {
  if (!Array.isArray(value)) return wrongType(node, value, path, 'array', problems)
  return value.map((item, index) => resolveNode(node.item, item ?? null, joinPath(path, index), problems))
}

function resolveTuple(node, value, path, problems) {
  if (!Array.isArray(value) || value.length !== node.items.length) {
    return wrongType(node, value, path, `array of ${node.items.length}`, problems)
  }
  return node.items.map((item, index) => resolveNode(item, value[index] ?? null, joinPath(path, index), problems))
}

function resolveDict(node, value, path, problems) {
  if (!isPlainObject(value)) return wrongType(node, value, path, 'object', problems)
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, resolveNode(node.item, item ?? null, joinPath(path, key), problems)]),
  )
}

/** 여러 꼴 가운데 하나. 문제 없이 풀리는 첫 꼴을 쓴다. 어느 꼴에도 맞지 않으면 문제 하나로 알린다. */
function resolveOneOf(node, value, path, problems) {
  for (const option of node.options) {
    const optionProblems = []
    const resolved = resolveNode(option, value, path, optionProblems)
    if (optionProblems.length === 0) return resolved
  }
  problems.push({ path, code: 'no-match', expected: node.options.map(describeKind).join(' | '), got: describe(value) })
  return structuredClone(node.fallback)
}

function describeKind(node) {
  if (node.kind === 'pattern') return `string ${node.regex}`
  if (node.kind === 'literal') return JSON.stringify(node.value)
  return node.kind
}

function resolveChoice(node, value, path, problems) {
  if (node.options.includes(value)) return value
  problems.push({ path, code: 'not-allowed', expected: node.options.join(' | '), got: describe(value) })
  return node.fallback
}

function resolveNumber(node, value, path, problems) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return wrongType(node, value, path, 'number', problems)
  if (value >= node.min && value <= node.max) return value
  problems.push({ path, code: 'out-of-range', expected: `${node.min}..${node.max}`, got: describe(value) })
  return node.fallback
}

function resolvePattern(node, value, path, problems) {
  if (typeof value === 'string' && node.regex.test(value)) return value
  problems.push({ path, code: 'no-match', expected: `string ${node.regex}`, got: describe(value) })
  return node.fallback
}

const RESOLVERS = {
  record: resolveRecord,
  partial: resolvePartial,
  list: resolveList,
  tuple: resolveTuple,
  dict: resolveDict,
  oneOf: resolveOneOf,
  choice: resolveChoice,
  number: resolveNumber,
  pattern: resolvePattern,
  count: (node, value, path, problems) =>
    Number.isInteger(value) && value >= 0 ? value : wrongType(node, value, path, 'integer >= 0', problems),
  text: (node, value, path, problems) =>
    typeof value === 'string' ? value : wrongType(node, value, path, 'string', problems),
  flag: (node, value, path, problems) =>
    typeof value === 'boolean' ? value : wrongType(node, value, path, 'boolean', problems),
  literal: (node, value, path, problems) =>
    value === node.value ? value : wrongType(node, value, path, JSON.stringify(node.value), problems),
}

function resolveNode(node, value, path, problems) {
  if (value === undefined) return defaultOf(node)
  return RESOLVERS[node.kind](node, value, path, problems)
}

// ── 키 사이 규칙(스키마 한 칸으로는 볼 수 없는 것) ─────────────

/** 문서 id 는 겹치지 않아야 한다. 출력 파일 이름과 `build <id>` 고르기에 쓰기 때문이다. */
export function findDuplicateIds(documents) {
  const seen = new Set()
  return documents.flatMap((document, index) => {
    if (!seen.has(document.id)) {
      seen.add(document.id)
      return []
    }
    return [{ path: `documents.${index}.id`, code: 'duplicate-id', got: document.id }]
  })
}

/** 한 모드에서만 뜻이 있는 키를 다른 모드 문서에 쓰면 문제다. raw 는 기본값을 채우기 전의 문서다. */
export function findModeMismatches(rawDocuments) {
  return rawDocuments.flatMap((document, index) =>
    Object.entries(MODE_ONLY_KEYS)
      .filter(([key, modes]) => document?.[key] !== undefined && !modes.includes(document.mode))
      .map(([key, modes]) => ({ path: `documents.${index}.${key}`, code: 'mode-key', expected: `mode ${modes.join(' | ')}`, got: document.mode })),
  )
}

/** 순수 판정. 읽은 값을 스키마에 견주어, 기본값을 채운 설정과 문제 목록을 돌려준다. */
export function validateConfig(raw) {
  const problems = []
  const config = resolveNode(CONFIG_SCHEMA, raw, '', problems)
  const rawDocuments = Array.isArray(raw?.documents) ? raw.documents : []
  problems.push(...findDuplicateIds(config.documents), ...findModeMismatches(rawDocuments))
  return { config, problems }
}
