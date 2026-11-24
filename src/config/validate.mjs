// 설정 검증 — 읽은 설정 값을 스키마에 견주어 기본값을 채운 설정과 문제 목록을 돌려준다. 디스크를 만지지 않는 순수 함수다.
// 부르는 곳: config/load.mjs(파일을 읽은 뒤), cli/commands/init.mjs(만든 견본의 자체 점검), 테스트.
// 먼저 읽을 파일: config/schema.mjs(받는 키와 기본값).
import { CONFIG_SCHEMA, MODE_ONLY_KEYS } from './schema.mjs'

/** 중괄호로 쓴 객체인가. Date · Map 같은 다른 객체는 설정의 묶음 자리에 올 수 없다. */
const isPlainObject = (value) => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))
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

/** 출력 파일 이름(out, 없으면 id)도 겹치지 않아야 한다. 겹치면 뒤 문서가 앞 문서의 파일을 덮어쓴다. Windows 는 대소문자를 가리지 않으므로 소문자로 견준다. */
export function findDuplicateOutputs(documents) {
  const seen = new Set()
  return documents.flatMap((document, index) => {
    const name = String(document.out || document.id).toLowerCase()
    if (!seen.has(name)) {
      seen.add(name)
      return []
    }
    return [{ path: `documents.${index}.out`, code: 'duplicate-out', got: name }]
  })
}

const RESERVED_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i

/**
 * 출력 이름으로 쓸 수 없는 꼴. 점 · 공백으로 끝나는 이름과 장치 이름은 Windows 에서 다른 파일이 되고,
 * `.web` 으로 끝나는 이름은 인쇄판(`이름.html`)이 다른 문서의 웹판(`이름.web.html`)과 겹친다.
 */
export function findBadOutputNames(documents) {
  return documents.flatMap((document, index) => {
    const isBad = /[. ]$/.test(document.out) || /\.web$/i.test(document.out) || RESERVED_NAME.test(document.out)
    return isBad ? [{ path: `documents.${index}.out`, code: 'no-match', expected: 'a file name that does not end with ".", " " or ".web" and is not a device name', got: document.out }] : []
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
  // 값이 아예 없으면(.mjs 설정에 기본 내보내기가 없는 경우) 기본값만으로 통과하지 않게 객체가 아닌 값으로 다룬다.
  const config = resolveNode(CONFIG_SCHEMA, raw ?? null, '', problems)
  const rawDocuments = Array.isArray(raw?.documents) ? raw.documents : []
  const duplicateIds = findDuplicateIds(config.documents)
  // id 가 겹친 문서는 출력 이름도 겹친다. 같은 실수를 두 번 알리지 않는다.
  const duplicateOutputs = duplicateIds.length ? [] : findDuplicateOutputs(config.documents)
  problems.push(...duplicateIds, ...duplicateOutputs, ...findBadOutputNames(config.documents), ...findModeMismatches(rawDocuments))
  return { config, problems }
}
