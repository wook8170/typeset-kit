// 명령줄 단위 테스트 — 명령 고르기, 종료 코드, 오류 문구, init 견본, 아직 없는 단계의 안내, 출력 선택.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/cli/main.mjs, src/cli/commands/*.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, test } from 'node:test'
import { planOutputs } from '../../src/build/index.mjs'
import { pickWritingMode } from '../../src/cli/commands/check-writing.mjs'
import { initConfigSource } from '../../src/cli/commands/init.mjs'
import { runCli } from '../../src/cli/main.mjs'
import { pickLanguage } from '../../src/cli/messages.mjs'
import { validateConfig } from '../../src/config/validate.mjs'
import { removeTree } from '../../src/platform.mjs'

async function runIn(cwd, argv, env = { LANG: 'en_US.UTF-8' }) {
  const out = []
  const err = []
  const code = await runCli(argv, { out: (text) => out.push(text), err: (text) => err.push(text), cwd, env })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

const makeDir = () => mkdtemp(join(tmpdir(), 'typeset-kit-test-'))

describe('명령 고르기', () => {
  test('명령이 없으면 사용법과 종료 코드 2, --help 는 0 이다', async () => {
    assert.equal((await runIn('/', [])).code, 2)
    const help = await runIn('/', ['--help'])
    assert.equal(help.code, 0)
    assert.match(help.out, /Usage: typeset-kit/)
  })
  test('모르는 명령과 모르는 옵션은 종료 코드 2 다', async () => {
    const unknown = await runIn('/', ['bake'])
    assert.equal(unknown.code, 2)
    assert.match(unknown.err, /Unknown command: bake/)
    const badOption = await runIn('/', ['build', '--colour'])
    assert.equal(badOption.code, 2)
    assert.match(badOption.err, /Invalid arguments/)
  })
  test('LANG 이 ko 면 한국어 문구다', async () => {
    assert.equal(pickLanguage({ LANG: 'ko_KR.UTF-8' }), 'ko')
    assert.equal(pickLanguage({ TYPESET_KIT_LANG: 'en', LANG: 'ko_KR.UTF-8' }), 'en')
    assert.match((await runIn('/', ['--help'], { LANG: 'ko_KR.UTF-8' })).out, /사용법/)
  })
})

describe('init', () => {
  test('견본 설정은 그대로 검사해도 문제가 없다(두 언어)', async () => {
    for (const locale of ['ko', 'en']) {
      const dir = await makeDir()
      const file = join(dir, 'typeset.config.mjs')
      await writeFile(file, initConfigSource(locale))
      const loaded = (await import(`${pathToFileURL(file).href}?${locale}`)).default
      assert.deepEqual(validateConfig(loaded).problems, [], locale)
      await removeTree(dir)
    }
  })
  test('파일을 만들고, 이미 있으면 --force 없이는 덮어쓰지 않는다', async () => {
    const dir = await makeDir()
    assert.equal((await runIn(dir, ['init'])).code, 0)
    await writeFile(join(dir, 'typeset.config.mjs'), '// mine')
    const again = await runIn(dir, ['init'])
    assert.equal(again.code, 1)
    assert.equal(await readFile(join(dir, 'typeset.config.mjs'), 'utf8'), '// mine')
    assert.equal((await runIn(dir, ['init', '--force', '--locale', 'en'])).code, 0)
    assert.match(await readFile(join(dir, 'typeset.config.mjs'), 'utf8'), /User Guide/)
    await removeTree(dir)
  })
})

describe('build · check · check-writing 의 틀', () => {
  test('설정 오류는 문제 목록과 함께 종료 코드 2 다', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, 'typeset.config.json'), '{"documents":[],"thmee":{}}')
    const result = await runIn(dir, ['build'])
    assert.equal(result.code, 2)
    assert.match(result.err, /unknown-key thmee/)
    await removeTree(dir)
  })
  test('없는 문서 id 를 주면 종료 코드 2 다', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, 'typeset.config.json'), '{"documents":[{"id":"a","mode":"book","src":"a.md"}]}')
    const result = await runIn(dir, ['build', 'zz'])
    assert.equal(result.code, 2)
    assert.match(result.err, /Unknown document id: zz/)
    await removeTree(dir)
  })
  test('아직 없는 단계는 종료 코드 2 와 안내다(브라우저를 띄우기 전에 멈춘다)', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, 'typeset.config.json'), '{"documents":[{"id":"a","mode":"pages","src":"p/*.html"}]}')
    const build = await runIn(dir, ['build'])
    assert.equal(build.code, 2)
    assert.match(build.err, /not implemented yet: mode:pages/)
    assert.match((await runIn(dir, ['check', 'a.pdf'])).err, /not implemented yet: check/)
    assert.match((await runIn(dir, ['check-writing'])).err, /not implemented yet: writing/)
    await removeTree(dir)
  })
  test('check 는 파일이 없으면 종료 코드 2 다', async () => {
    assert.equal((await runIn('/', ['check'])).code, 2)
  })
})

describe('옵션 판정', () => {
  test('출력 선택: 기본은 PDF + 인쇄판 HTML, --html-only 는 PDF 없이, --web 만 주면 웹판만', () => {
    assert.deepEqual(planOutputs({}), { pdf: true, printHtml: true, web: false })
    assert.deepEqual(planOutputs({ htmlOnly: true }), { pdf: false, printHtml: true, web: false })
    assert.deepEqual(planOutputs({ web: true }), { pdf: false, printHtml: false, web: true })
    assert.deepEqual(planOutputs({ pdf: true, web: true }), { pdf: true, printHtml: true, web: true })
  })
  test('글쓰기 검사 방식: --check 와 --update-baseline 은 함께 쓸 수 없다', () => {
    assert.equal(pickWritingMode({}), 'report')
    assert.equal(pickWritingMode({ check: true }), 'check')
    assert.equal(pickWritingMode({ 'update-baseline': true }), 'update-baseline')
    assert.equal(pickWritingMode({ check: true, 'update-baseline': true }), null)
  })
})
