// doctor 명령 — 굽기 환경을 점검해 항목마다 ok · warn · fail 을 적는다. fail 이 있으면 종료 코드 1 이다.
// 부르는 곳: cli/main.mjs.
// 먼저 읽을 파일: doctor/run.mjs(사실 모으기), doctor/judge.mjs(판정).
import { doctorExitCode } from '../../doctor/judge.mjs'
import { runDoctor } from '../../doctor/run.mjs'

export const options = { json: { type: 'boolean' } }

const LABEL_WIDTH = 10

/** 결과 한 줄(순수 함수). 여러 줄인 설명은 들여 써서 붙인다. */
export function formatDoctorLine(item, labels) {
  const [first, ...more] = String(item.detail).split('\n')
  const head = `${item.status.padEnd(4)} ${(labels[item.id] ?? item.id).padEnd(LABEL_WIDTH)} ${first}`
  return [head, ...more.map((line) => `${' '.repeat(LABEL_WIDTH + 6)}${line}`)].join('\n')
}

export async function run({ values }, io) {
  const results = await runDoctor({ cwd: io.cwd, env: io.env })
  if (values.json) io.out(JSON.stringify(results, null, 2))
  else for (const item of results) io.out(formatDoctorLine(item, io.messages.doctorLabels))
  return doctorExitCode(results)
}
