#!/usr/bin/env node
// typeset-kit 명령 — 명령줄 인자를 cli/main.mjs 에 넘기고 돌려받은 종료 코드로 끝낸다.
// 부르는 곳: npm 이 만든 실행 링크(npx typeset-kit), 직접 실행(node bin/typeset-kit.mjs).
// 먼저 읽을 파일: src/cli/main.mjs.
import { runCli } from '../src/cli/main.mjs'

const io = {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
  cwd: process.cwd(),
  env: process.env,
}
process.exitCode = await runCli(process.argv.slice(2), io)
