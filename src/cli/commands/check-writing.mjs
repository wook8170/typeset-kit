// check-writing 명령 — 글쓰기 규칙을 검사한다. --check 는 기준선과 대조하고(줄었으면 재잠금을 안내한다), --update-baseline 은 기준선을 다시 잠근다.
// 부르는 곳: cli/main.mjs.
// 먼저 읽을 파일: docs/contract.md 「check-writing 의 결과」.
import { checkWriting } from '../../index.mjs'
import { EXIT } from '../exit.mjs'

export const options = { check: { type: 'boolean' }, 'update-baseline': { type: 'boolean' }, json: { type: 'boolean' } }

/** 실행 방식(순수 함수). 두 옵션을 함께 주면 null 이다. */
export function pickWritingMode(values) {
  if (values.check && values['update-baseline']) return null
  if (values.check) return 'check'
  if (values['update-baseline']) return 'update-baseline'
  return 'report'
}

/** 재잠금 안내를 낼까(순수 함수). 기준선과 대조했을 때 줄어든 칸이 있고, 늘어난 칸은 없을 때만 낸다. */
export function shouldSuggestRelock(mode, result) {
  return mode === 'check' && !result.hasProblems && (result.improved?.length ?? 0) > 0
}

export async function run({ values }, io) {
  const mode = pickWritingMode(values)
  if (!mode) {
    io.err(io.messages.writingMode)
    return EXIT.usage
  }
  const result = await checkWriting({ cwd: io.cwd, configFile: values.config, mode })
  if (values.json) {
    io.out(JSON.stringify(result, null, 2))
    return result.hasProblems ? EXIT.failed : EXIT.ok
  }
  for (const finding of result.findings) io.out(`${finding.file}:${finding.line} [${finding.rule}] ${finding.text}${finding.suggest ? ` -> ${finding.suggest}` : ''}`)
  if (shouldSuggestRelock(mode, result)) io.out(io.messages.writingImproved(result.improved.length))
  return result.hasProblems ? EXIT.failed : EXIT.ok
}
