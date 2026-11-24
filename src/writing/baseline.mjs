// 래칫 기준선 — 「규칙 × 파일」 칸마다 지금 있는 건수를 기억하고, 늘었는지 줄었는지 견준다.
// 부르는 곳: writing/index.mjs. 비교 · 집계는 순수 함수이고, 읽기 · 쓰기만 파일에 닿는다.
// 먼저 읽을 파일: docs/contract.md 「check-writing 의 결과」.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

const FORMAT_VERSION = 1

/** 찾은 것 → `{ 규칙: { 파일: 건수 } }`. ratchet 규칙만 센다. */
export function tallyCells(findings) {
  const cells = {}
  for (const finding of findings) {
    if (finding.level !== 'ratchet') continue
    const byFile = (cells[finding.rule] ??= {})
    byFile[finding.file] = (byFile[finding.file] ?? 0) + 1
  }
  return cells
}

const cellCount = (cells, rule, file) => cells?.[rule]?.[file] ?? 0

/** 기준선과 지금을 칸마다 견준다. 돌려주는 값 = { regressed, improved } (각각 [{ rule, file, was, now }]). */
export function compareCells(baseline, current) {
  const regressed = []
  const improved = []
  const rules = new Set([...Object.keys(baseline), ...Object.keys(current)])
  for (const rule of [...rules].sort()) {
    const files = new Set([...Object.keys(baseline[rule] ?? {}), ...Object.keys(current[rule] ?? {})])
    for (const file of [...files].sort()) {
      const was = cellCount(baseline, rule, file)
      const now = cellCount(current, rule, file)
      if (now > was) regressed.push({ rule, file, was, now })
      else if (now < was) improved.push({ rule, file, was, now })
    }
  }
  return { regressed, improved }
}

const sumCells = (cells) => Object.values(cells).reduce((sum, byFile) => sum + Object.values(byFile).reduce((inner, count) => inner + count, 0), 0)

const sortedCells = (cells) =>
  Object.fromEntries(Object.keys(cells).sort().map((rule) => [rule, Object.fromEntries(Object.entries(cells[rule]).sort(([left], [right]) => left.localeCompare(right)))]))

/** 기준선 파일 읽기. 없으면 null, 깨졌으면 오류다. */
export function readBaseline(path) {
  if (!existsSync(path)) return null
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Writing baseline is not valid JSON: ${path}`, { cause: error })
  }
  if (parsed.version !== FORMAT_VERSION || typeof parsed.rules !== 'object') throw new Error(`Writing baseline has an unknown format: ${path}`)
  return parsed.rules
}

/** 기준선 파일 쓰기. 같은 입력이면 같은 내용이 나온다(날짜를 적지 않는다). 임시 파일에 쓴 뒤 바꿔 넣는다. */
export function writeBaseline(path, cells) {
  const document = { version: FORMAT_VERSION, total: sumCells(cells), rules: sortedCells(cells) }
  const temporary = `${path}.tmp`
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`)
  renameSync(temporary, path)
  return document.total
}
