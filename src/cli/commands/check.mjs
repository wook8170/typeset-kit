// check 명령 — PDF 의 차례 · 책갈피 · 링크 · 쪽 번호 표기를 검사한다. 검사 자체는 check/index.mjs 가 한다.
// 부르는 곳: cli/main.mjs.
// 먼저 읽을 파일: docs/contract.md 「check 의 결과」.
import { resolve } from 'node:path'
import { check } from '../../index.mjs'
import { EXIT } from '../exit.mjs'

export const options = { json: { type: 'boolean' } }

export async function run({ values, positionals }, io) {
  if (positionals.length === 0) {
    io.err(io.messages.checkNeedsFiles)
    return EXIT.usage
  }
  const result = await check(positionals.map((file) => resolve(io.cwd, file)), { cwd: io.cwd, configFile: values.config })
  if (values.json) io.out(JSON.stringify(result, null, 2))
  else for (const item of result.results) io.out(`${item.status} ${item.file}${item.problems?.length ? `\n  ${item.problems.join('\n  ')}` : ''}`)
  return result.hasProblems ? EXIT.failed : EXIT.ok
}
