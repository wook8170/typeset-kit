// 글쓰기 검사 — 조판 원고(Markdown · 책 명세 · 쪽 HTML)와 설정한 글롭의 글에서 쓰지 않기로 한 표현을 찾고, 래칫 기준선과 견준다.
// 부르는 곳: src/index.mjs 의 checkWriting(check-writing 명령).
// 먼저 읽을 파일: README.md(흐름), docs/contract.md 「check-writing 의 결과」.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { toImportUrl } from '../platform.mjs'
import { compareCells, readBaseline, tallyCells, writeBaseline } from './baseline.mjs'
import { extractHtml, extractMarkdown, extractSpec } from './extract.mjs'
import { knownRuleNames, resolveRuleMode, selectRules } from './rules.mjs'
import { scanLines } from './scan.mjs'
import { collectTargets } from './targets.mjs'

/** 글쓰기 검사를 시작할 수 없을 때의 오류(볼 파일 없음 등). 명령은 스택 없이 문구만 보인다. */
export class WritingCheckError extends Error {
  constructor(message) {
    super(message)
    this.name = 'WritingCheckError'
  }
}

async function loadSpec(absolutePath, sourceText) {
  if (absolutePath.endsWith('.json')) return JSON.parse(sourceText)
  const loaded = await import(toImportUrl(absolutePath))
  return loaded.default ?? loaded.spec ?? loaded
}

/** 파일 하나의 산문 줄. 원고 종류마다 뽑는 방법이 다르다. */
async function proseLinesOf(root, target) {
  const absolutePath = resolve(root, target.file)
  const sourceText = readFileSync(absolutePath, 'utf8')
  if (target.kind === 'markdown') return extractMarkdown(sourceText)
  if (target.kind === 'html') return extractHtml(sourceText)
  return extractSpec(await loadSpec(absolutePath, sourceText), sourceText)
}

const isAllowed = (allow, file, rule) => allow.some((entry) => entry.file === file && (entry.rule === rule || entry.rule === '*'))

/** 설정에 적은 규칙 이름이 알려진 묶음인지 확인한다. 오타는 조용히 지나가지 않게 오류로 알린다. */
function assertKnownRules(writing) {
  const known = knownRuleNames(writing.extraBanned)
  for (const rule of Object.keys(writing.rules)) if (!known.has(rule)) throw new Error(`Unknown writing rule in "writing.rules": ${rule}`)
}

async function scanTargets({ root, targets, writing }) {
  const rules = selectRules(writing)
  const findings = []
  for (const target of targets) {
    const lines = await proseLinesOf(root, target)
    for (const match of scanLines(lines, rules)) {
      if (isAllowed(writing.allow, target.file, match.rule)) continue
      findings.push({ file: target.file, line: match.line, rule: match.rule, text: match.text, suggest: match.suggest, level: resolveRuleMode(match.rule, writing.rules) })
    }
  }
  return findings
}

/** check 모드: ratchet 규칙은 기준선보다 늘어난 칸의 찾은 것만 남긴다. 기준선이 없으면 모든 칸이 늘어난 것으로 본다. */
function applyBaseline(findings, baseline) {
  const { regressed, improved } = compareCells(baseline ?? {}, tallyCells(findings))
  const isRegressed = (finding) => regressed.some((cell) => cell.rule === finding.rule && cell.file === finding.file)
  return { findings: findings.filter((finding) => finding.level !== 'ratchet' || isRegressed(finding)), regressed, improved }
}

/**
 * 글쓰기를 검사한다. mode = report(모두 보고) · check(기준선과 견줌) · update-baseline(기준선을 지금 값으로 다시 잠금).
 * 돌려주는 값 = { findings, hasProblems, regressed, improved }. 상세는 docs/contract.md 8절.
 */
export async function checkWriting({ root, config, mode = 'report' }) {
  const writing = config.writing
  const empty = { findings: [], hasProblems: false, regressed: [], improved: [] }
  if (writing.languages.length === 0) return empty
  assertKnownRules(writing)
  const targets = collectTargets({ root, config })
  // 볼 파일이 하나도 없는데 통과로 끝나면 빈 설정을 「문제 없음」으로 읽게 된다.
  if (targets.length === 0) throw new WritingCheckError('Writing check: no files to check (add documents or writing.globs)')
  const all = await scanTargets({ root, targets, writing })
  const baselinePath = resolve(root, writing.baseline)
  if (mode === 'update-baseline') {
    writeBaseline(baselinePath, tallyCells(all))
    return { ...empty, findings: all.filter((finding) => finding.level !== 'ratchet'), hasProblems: all.some((finding) => finding.level === 'fail') }
  }
  if (mode === 'report') return { ...empty, findings: all, hasProblems: all.some((finding) => finding.level === 'fail') }
  const { findings, regressed, improved } = applyBaseline(all, readBaseline(baselinePath))
  return { findings, regressed, improved, hasProblems: findings.some((finding) => finding.level === 'fail') || regressed.length > 0 }
}
