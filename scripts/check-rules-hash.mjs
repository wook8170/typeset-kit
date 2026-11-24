// 릴리스 점검 — 규칙 파일 사본의 해시를 기록값과 대조한다. 정본 폴더를 주면 정본과도 대조한다.
// 부르는 곳: 사람이 릴리스 전에(`node scripts/check-rules-hash.mjs [<정본 폴더>]`). 다르면 종료 코드 1.
// 먼저 읽을 파일: src/writing/rule-sources.mjs, rules/SOURCE.json.
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyRuleSources } from '../src/writing/rule-sources.mjs'

const rulesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../rules')
const upstreamDir = process.argv[2] ? resolve(process.argv[2]) : null
const problems = verifyRuleSources(rulesDir, upstreamDir)
for (const problem of problems) process.stderr.write(`${problem}\n`)
process.stdout.write(problems.length === 0 ? `rules hash ok${upstreamDir ? ' (upstream checked)' : ''}\n` : '')
process.exit(problems.length === 0 ? 0 : 1)
