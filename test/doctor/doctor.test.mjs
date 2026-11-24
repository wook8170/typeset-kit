// doctor 단위 테스트 — 항목별 판정 규칙과, 가짜 브라우저를 넣은 전체 점검 흐름.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/doctor/judge.mjs, src/doctor/run.mjs.
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { formatDoctorLine } from '../../src/cli/commands/doctor.mjs'
import { validateConfig } from '../../src/config/validate.mjs'
import {
  collectFontSpecs,
  doctorExitCode,
  judgeConfig,
  judgeFonts,
  judgeNode,
  judgeOutline,
} from '../../src/doctor/judge.mjs'
import { runDoctor } from '../../src/doctor/run.mjs'
import { removeTree } from '../../src/platform.mjs'

describe('판정', () => {
  test('Node 는 22 이상이어야 한다', () => {
    assert.equal(judgeNode('22.0.0').status, 'ok')
    assert.equal(judgeNode('v20.11.1').status, 'fail')
  })
  test('설정이 없으면 경고, 문제가 있으면 실패다', () => {
    assert.equal(judgeConfig({ isMissing: true }).status, 'warn')
    const failed = judgeConfig({ file: 'c.mjs', problems: [{ code: 'unknown-key', path: 'x', expected: 'a | b' }] })
    assert.equal(failed.status, 'fail')
    assert.match(failed.detail, /unknown-key x \(expected a \| b\)/)
  })
  test('책갈피가 생기지 않거나 브라우저가 뜨지 않으면 실패다', () => {
    assert.equal(judgeOutline({ product: 'Chrome/130', hasOutline: true }).status, 'ok')
    assert.equal(judgeOutline({ product: 'Chrome/110', hasOutline: false }).status, 'fail')
    assert.equal(judgeOutline({ error: new Error('crash') }).status, 'fail')
  })
  test('글꼴 지정은 전역과 문서 덮어쓰기에서 겹치지 않게 모은다', () => {
    const { config } = validateConfig({
      documents: [
        { id: 'a', mode: 'book', src: 'a.md', theme: { fonts: { sans: 'builtin:noto-sans-kr', mono: 'builtin:other' } } },
      ],
    })
    assert.deepEqual(collectFontSpecs(config), ['builtin:noto-sans-kr', 'builtin:jetbrains-mono', 'builtin:other'])
  })
  test('내장 글꼴 표에 없거나 파일이 없으면 실패다', () => {
    const builtinFonts = { 'noto-sans-kr': { family: 'Noto Sans KR', files: [{ path: 'noto-400.woff2' }] } }
    const facts = { builtinFonts, builtinPath: (path) => `/pkg/fonts/${path}`, resolveFile: (path) => `/repo/${path}` }
    const present = judgeFonts(['builtin:noto-sans-kr'], { ...facts, fileExists: () => true })
    assert.equal(present.status, 'ok')
    const missing = judgeFonts(
      ['builtin:noto-sans-kr', 'builtin:nope', { family: 'X', files: [{ path: 'f/x.woff2' }] }],
      { ...facts, fileExists: () => false },
    )
    assert.equal(missing.status, 'fail')
    assert.deepEqual(missing.detail.split('\n').slice(1), ['/pkg/fonts/noto-400.woff2', 'builtin:nope (not bundled)', '/repo/f/x.woff2'])
    assert.equal(judgeFonts(['builtin:noto-sans-kr'], { ...facts, builtinFonts: null, fileExists: () => true }).status, 'fail')
  })
  test('fail 이 하나라도 있으면 종료 코드 1 이다', () => {
    assert.equal(doctorExitCode([{ status: 'ok' }, { status: 'warn' }]), 0)
    assert.equal(doctorExitCode([{ status: 'ok' }, { status: 'fail' }]), 1)
  })
  test('여러 줄 설명은 들여 써서 붙인다', () => {
    const line = formatDoctorLine({ id: 'fonts', status: 'fail', detail: 'missing\n/a' }, { fonts: 'Fonts' })
    assert.equal(line, `fail Fonts      missing\n${' '.repeat(16)}/a`)
  })
})

describe('전체 점검', () => {
  test('설정의 브라우저 경로가 없으면 브라우저를 띄우지 않고 실패로 알린다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'typeset-kit-test-'))
    await writeFile(join(dir, 'typeset.config.json'), JSON.stringify({ browser: { path: 'nope/chrome' }, documents: [] }))
    let launched = false
    const results = await runDoctor({ cwd: dir, env: {}, nodeVersion: '22.1.0', launch: async () => { launched = true } })
    assert.deepEqual(results.map((item) => [item.id, item.status]), [['node', 'ok'], ['config', 'ok'], ['browser', 'fail'], ['fonts', 'ok']], '내장 글꼴 파일은 패키지에 들어 있다')
    assert.ok(!launched)
    await removeTree(dir)
  })
  test('브라우저가 있으면 가짜 브라우저로 책갈피를 확인한다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'typeset-kit-test-'))
    const fakeChrome = join(dir, 'chrome')
    await writeFile(fakeChrome, '')
    const launch = async (fn, options) => {
      assert.equal(options.browserPath, fakeChrome)
      const cdp = {
        send: async (method) => {
          if (method === 'Browser.getVersion') return { product: 'HeadlessChrome/131.0.1.2' }
          if (method === 'Target.createTarget') return { targetId: 't' }
          if (method === 'Target.attachToTarget') return { sessionId: 's' }
          if (method === 'Page.printToPDF') return { data: Buffer.from('%PDF /Outlines 3 0 R').toString('base64') }
          return {}
        },
      }
      return fn(cdp)
    }
    const results = await runDoctor({ cwd: dir, env: { CHROME_BIN: fakeChrome }, nodeVersion: '22.1.0', launch })
    const outline = results.find((item) => item.id === 'outline')
    assert.equal(outline.status, 'ok')
    assert.match(outline.detail, /HeadlessChrome\/131/)
    assert.equal(results.find((item) => item.id === 'config').status, 'warn')
    await removeTree(dir)
  })
})
