// build 명령 — 설정의 문서를 굽고, 문서마다 문제 수를 알린다.
// 부르는 곳: cli/main.mjs.
// 먼저 읽을 파일: build/index.mjs(굽기 흐름).
import { build, planOutputs } from '../../build/index.mjs'
import { EXIT } from '../exit.mjs'

export const options = {
  pdf: { type: 'boolean' },
  web: { type: 'boolean' },
  'html-only': { type: 'boolean' },
  'allow-overflow': { type: 'boolean' },
}

export async function run({ values, positionals }, io) {
  const outputs = planOutputs({ pdf: values.pdf, web: values.web, htmlOnly: values['html-only'] })
  const result = await build({
    cwd: io.cwd,
    configFile: values.config,
    ids: positionals,
    outputs,
    allowOverflow: Boolean(values['allow-overflow']),
  })
  for (const report of result.reports.filter((item) => item.problems.length > 0)) {
    io.err([io.messages.documentProblems(report.id, report.problems.length), ...report.problems.map((problem) => `  ${problem}`)].join('\n'))
  }
  io.out(io.messages.built(result.reports.length, result.outDir))
  return result.hasProblems ? EXIT.failed : EXIT.ok
}
