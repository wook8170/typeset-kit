// check 명령 시험 — 명령줄에서 PDF 를 검사해 종료 코드와 출력을 확인한다.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/cli/commands/check.mjs, src/check/index.mjs.
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { runCli } from '../../src/cli/main.mjs'
import { blankBytes, bookBytes } from './fixtures.mjs'

let dir
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'typeset-kit-check-cli-'))
  await writeFile(join(dir, 'good.pdf'), await bookBytes())
  await writeFile(join(dir, 'bad.pdf'), await blankBytes(2))
})
after(() => rm(dir, { recursive: true, force: true }))

async function check(args) {
  const out = []
  const err = []
  const code = await runCli(['check', ...args], { out: (text) => out.push(text), err: (text) => err.push(text), cwd: dir, env: { LANG: 'en_US.UTF-8' } })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

test('통과하면 종료 코드 0 이다', async () => {
  const result = await check(['good.pdf'])
  assert.equal(result.code, 0)
  assert.match(result.out, /^ok good\.pdf/)
})

test('문제가 있으면 문제 줄을 내고 종료 코드 1 이다', async () => {
  const result = await check(['good.pdf', 'bad.pdf'])
  assert.equal(result.code, 1)
  assert.match(result.out, /fail bad\.pdf\n {2}page-mode:/)
})

test('--json 은 결과를 그대로 낸다', async () => {
  const result = await check(['--json', 'bad.pdf'])
  const parsed = JSON.parse(result.out)
  assert.equal(parsed.hasProblems, true)
  assert.equal(parsed.results[0].file, 'bad.pdf')
  assert.equal(parsed.results[0].facts.pages, 2)
})

test('파일을 하나도 안 주면 종료 코드 2 다', async () => {
  assert.equal((await check([])).code, 2)
})
