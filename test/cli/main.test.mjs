// 명령줄 단위 테스트 — 명령 고르기, 종료 코드, 오류 문구, init 견본과 예제 원고, 아직 없는 단계의 안내, 출력 선택, 재잠금 안내.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/cli/main.mjs, src/cli/commands/*.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, test } from 'node:test'
import { planOutputs } from '../../src/build/index.mjs'
import { pickWritingMode, shouldSuggestRelock } from '../../src/cli/commands/check-writing.mjs'
import { initConfigSource } from '../../src/cli/commands/init.mjs'
import { describeError, runCli } from '../../src/cli/main.mjs'
import { messagesFor, pickLanguage } from '../../src/cli/messages.mjs'
import { validateConfig } from '../../src/config/validate.mjs'
import { removeTree } from '../../src/platform.mjs'
import { NotImplementedError } from '../../src/stages.mjs'

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
  test('설정과 예제 원고 · 개정 이력 · 그림을 만들고, 만든 설정으로 인쇄판 HTML 을 굽는다', async () => {
    const dir = await makeDir()
    assert.equal((await runIn(dir, ['init', '--locale', 'en'])).code, 0)
    for (const file of ['docs/guide.md', 'docs/guide.revisions.json', 'docs/figures/flow.svg']) assert.ok((await readFile(join(dir, file), 'utf8')).length > 0, file)
    const build = await runIn(dir, ['build', '--html-only'])
    assert.equal(build.code, 0, build.err)
    assert.match(await readFile(join(dir, 'typeset-out/guide.html'), 'utf8'), /Writing Guide/)
    await removeTree(dir)
  })
  test('예제 원고가 이미 있으면 --force 없이는 아무것도 쓰지 않고, 모르는 언어는 종료 코드 2 다', async () => {
    const dir = await makeDir()
    await mkdir(join(dir, 'docs'))
    await writeFile(join(dir, 'docs/guide.md'), '# mine')
    const again = await runIn(dir, ['init'])
    assert.equal(again.code, 1)
    assert.match(again.err, /docs\/guide\.md/)
    assert.equal(await readFile(join(dir, 'docs/guide.md'), 'utf8'), '# mine')
    assert.equal((await runIn(dir, ['init', '--locale', 'fr'])).code, 2)
    await removeTree(dir)
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
  test('모든 단계가 있어서 「아직 없는 단계」 안내가 나오지 않는다', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, 'typeset.config.json'), '{"documents":[{"id":"a","mode":"pages","src":"p/*.html"},{"id":"b","mode":"book","src":"b.md"}]}')
    const build = await runIn(dir, ['build', '--html-only'])
    assert.equal(build.code, 1, '원고가 없어 문제로 끝난다')
    assert.doesNotMatch(build.err, /not implemented/)
    assert.doesNotMatch((await runIn(dir, ['check', 'a.pdf'])).err, /not implemented/)
    assert.doesNotMatch((await runIn(dir, ['check-writing'])).err, /not implemented/)
    await removeTree(dir)
  })
  test('아직 없는 단계의 오류는 종료 코드 2 와 안내 문구로 바뀐다', () => {
    const known = describeError(new NotImplementedError('mode:poster', './modes/poster.mjs'), messagesFor('en'))
    assert.deepEqual(known, { code: 2, text: 'This stage is not implemented yet: mode:poster' })
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
  test('재잠금 안내: 기준선 대조에서 줄어든 칸만 있을 때 낸다', () => {
    const improved = [{ rule: 'hype', file: 'a.md', was: 2, now: 1 }]
    assert.equal(shouldSuggestRelock('check', { hasProblems: false, improved }), true)
    assert.equal(shouldSuggestRelock('check', { hasProblems: true, improved }), false)
    assert.equal(shouldSuggestRelock('report', { hasProblems: false, improved }), false)
    assert.equal(shouldSuggestRelock('check', { hasProblems: false, improved: [] }), false)
  })
  test('check-writing --check 가 줄어든 칸을 보면 재잠금을 안내한다', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, 'typeset.config.json'), '{"documents":[{"id":"a","mode":"book","src":"a.md"}]}')
    await writeFile(join(dir, 'a.md'), '# 제목\n\n강력한 기능과 혁신적인 구조.\n')
    assert.equal((await runIn(dir, ['check-writing', '--update-baseline'])).code, 0)
    await writeFile(join(dir, 'a.md'), '# 제목\n\n기능과 구조.\n')
    const checked = await runIn(dir, ['check-writing', '--check'])
    assert.equal(checked.code, 0)
    assert.match(checked.out, /--update-baseline/)
    await removeTree(dir)
  })
})
