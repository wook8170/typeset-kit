// 규칙 파일 해시 대조 — rules/ko.mjs · en.mjs 가 정본(lanekit)의 사본과 바이트 단위로 같은지 확인한다.
// 부르는 곳: scripts/check-rules-hash.mjs(릴리스 점검), 시험.
// 먼저 읽을 파일: rules/SOURCE.json(정본 해시 기록).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sha256Of = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

/**
 * 사본이 기록된 해시와 같은지 본다. upstreamDir 를 주면 정본 파일(SOURCE.json 의 upstream 이름)과도 견준다.
 * 돌려주는 값 = 문제 목록(문자열). 비어 있으면 통과다.
 */
export function verifyRuleSources(rulesDir, upstreamDir = null) {
  const record = JSON.parse(readFileSync(join(rulesDir, 'SOURCE.json'), 'utf8'))
  const problems = []
  for (const [name, entry] of Object.entries(record.files)) {
    const copyHash = sha256Of(join(rulesDir, name))
    if (copyHash !== entry.sha256) problems.push(`${name}: copy differs from the recorded hash (${copyHash})`)
    if (upstreamDir) {
      const upstreamHash = sha256Of(join(upstreamDir, entry.upstream))
      if (upstreamHash !== entry.sha256) problems.push(`${name}: upstream ${entry.upstream} differs from the recorded hash (${upstreamHash})`)
    }
  }
  return problems
}
