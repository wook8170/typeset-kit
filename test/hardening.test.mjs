// 경로 · 덮어쓰기 방어 시험 — 원고가 프로젝트 폴더 밖 파일을 싣지 못하는지, init 이 링크를 따라가 쓰지 않는지, 출력 이름이 폴더를 벗어나지 않는지 본다.
// 부르는 곳: npm test. 브라우저가 필요 없다. 심볼릭 링크를 만들 수 없는 환경(권한 없는 Windows)에서는 링크 항목을 건너뛴다.
// 먼저 읽을 파일: src/platform.mjs(isInsideRoot), src/input/images.mjs, src/modes/pages/assets.mjs, src/cli/commands/init.mjs.
import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { withinTime } from '../src/browser/print.mjs'
import { runCli } from '../src/cli/main.mjs'
import { validateConfig } from '../src/config/validate.mjs'
import { inlineSpecImages } from '../src/input/images.mjs'
import { inlineAssets } from '../src/modes/pages/assets.mjs'
import { isInsideRoot, removeTree } from '../src/platform.mjs'

const base = mkdtempSync(join(tmpdir(), 'typeset-kit-test-'))
after(() => removeTree(base))

/** 프로젝트 폴더(project)와 그 밖의 비밀 파일(outside/secret.png)을 만든다. */
function makeProject(name) {
  const project = join(base, name, 'project')
  const outside = join(base, name, 'outside')
  mkdirSync(join(project, 'docs'), { recursive: true })
  mkdirSync(outside, { recursive: true })
  writeFileSync(join(outside, 'secret.png'), 'SECRET')
  writeFileSync(join(project, 'docs', 'inside.png'), 'INSIDE')
  return { project, outside }
}

/** 심볼릭 링크를 만든다. 만들 수 없는 환경이면 false 를 돌려준다. */
function tryLink(target, path) {
  try {
    symlinkSync(target, path)
    return true
  } catch (error) {
    if (error.code !== 'EPERM') throw error
    return false
  }
}

const figureSpec = (src, extra = {}) => ({ title: 't', chapters: [{ no: '1', title: 'c', sections: [{ no: '1.1', title: 's', blocks: [{ t: 'figure', src, caption: 'x', ...extra }] }] }] })
const SECRET_BASE64 = Buffer.from('SECRET').toString('base64')

describe('isInsideRoot', () => {
  const { project, outside } = makeProject('inside')
  test('폴더 안의 있는 파일 · 없는 파일은 안이고, ../ 로 나간 경로와 이름만 비슷한 옆 폴더는 밖이다', () => {
    assert.equal(isInsideRoot(project, join(project, 'docs', 'inside.png')), true)
    assert.equal(isInsideRoot(project, join(project, 'docs', 'not-yet.png')), true)
    assert.equal(isInsideRoot(project, join(project, '..', 'outside', 'secret.png')), false)
    assert.equal(isInsideRoot(project, `${project}-sibling/x.png`), false)
  })
  test('폴더 안의 링크가 밖을 가리키면 밖이다', (context) => {
    if (!tryLink(join(outside, 'secret.png'), join(project, 'docs', 'link.png'))) return context.skip('symbolic links are not permitted here')
    assert.equal(isInsideRoot(project, join(project, 'docs', 'link.png')), false)
  })
})

describe('book · spec 모드의 그림', () => {
  const { project, outside } = makeProject('figures')
  test('../ · 절대 경로로 프로젝트 밖을 가리키는 그림은 읽지 않고 outside-root 로 알린다', async () => {
    for (const src of ['docs/../../outside/secret.png', join(outside, 'secret.png'), '../outside/absent.png']) {
      const { spec, problems } = await inlineSpecImages(figureSpec(src), { root: project })
      assert.equal(problems.length, 1, src)
      assert.match(problems[0], /^outside-root: /, src)
      assert.ok(!JSON.stringify(spec).includes(SECRET_BASE64), src)
    }
  })
  test('프로젝트 안의 링크가 밖을 가리켜도 읽지 않는다', async (context) => {
    if (!tryLink(join(outside, 'secret.png'), join(project, 'docs', 'link.png'))) return context.skip('symbolic links are not permitted here')
    const { spec, problems } = await inlineSpecImages(figureSpec('docs/link.png'), { root: project })
    assert.match(problems[0], /^outside-root: docs\/link\.png/)
    assert.ok(!JSON.stringify(spec).includes(SECRET_BASE64))
  })
  test('SVG 안의 그림 참조가 밖을 가리키면 읽지 않는다', async () => {
    writeFileSync(join(project, 'docs', 'fig.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><image href="../../outside/secret.png"/></svg>')
    const { spec, problems } = await inlineSpecImages(figureSpec('docs/fig.svg', { inline: true }), { root: project })
    assert.match(problems[0], /^outside-root: /)
    assert.ok(!JSON.stringify(spec).includes(SECRET_BASE64))
  })
  test('프로젝트 안의 그림은 그대로 넣는다', async () => {
    const { problems, spec } = await inlineSpecImages(figureSpec('docs/inside.png'), { root: project })
    assert.deepEqual(problems, [])
    assert.ok(JSON.stringify(spec).includes(Buffer.from('INSIDE').toString('base64')))
  })
})

describe('pages 모드의 로컬 참조', () => {
  const { project } = makeProject('pages')
  test('그림 · 스타일시트 · CSS url() 이 프로젝트 밖을 가리키면 읽지 않고 outside 로 모은다', async () => {
    writeFileSync(join(project, '..', 'outside', 'site.css'), 'body{color:red}')
    const source = '<link rel="stylesheet" href="../../outside/site.css"><img src="../../outside/secret.png"><style>a{background:url(../../outside/secret.png)}</style><img src="inside.png">'
    const { html, outside, missing } = await inlineAssets(source, join(project, 'docs'), project)
    assert.deepEqual(outside.sort(), ['../../outside/secret.png', '../../outside/site.css'])
    assert.deepEqual(missing, [])
    assert.ok(!html.includes(SECRET_BASE64) && !html.includes('color:red'))
    assert.ok(html.includes(Buffer.from('INSIDE').toString('base64')))
  })
})

describe('init', () => {
  const io = (cwd) => ({ out: () => {}, err: () => {}, cwd, env: {} })
  test('설정 파일 자리가 끊어진 링크면 있는 것으로 보고 쓰지 않는다. --force 면 링크를 지우고 새 파일을 쓴다', async (context) => {
    const { project, outside } = makeProject('init-link')
    const victim = join(outside, 'victim.mjs')
    if (!tryLink(victim, join(project, 'typeset.config.mjs'))) return context.skip('symbolic links are not permitted here')
    assert.equal(await runCli(['init'], io(project)), 1)
    assert.equal(existsSync(victim), false)
    assert.equal(await runCli(['init', '--force'], io(project)), 0)
    assert.equal(existsSync(victim), false)
    assert.equal(lstatSync(join(project, 'typeset.config.mjs')).isSymbolicLink(), false)
  })
  test('docs 폴더가 밖을 가리키는 링크면 --force 가 있어도 쓰지 않는다', async (context) => {
    const project = join(base, 'init-dir', 'project')
    const outside = join(base, 'init-dir', 'outside')
    mkdirSync(project, { recursive: true })
    mkdirSync(outside, { recursive: true })
    if (!tryLink(outside, join(project, 'docs'))) return context.skip('symbolic links are not permitted here')
    assert.equal(await runCli(['init', '--force'], io(project)), 1)
    assert.equal(existsSync(join(outside, 'guide.md')), false)
    assert.equal(existsSync(join(project, 'typeset.config.mjs')), false)
  })
  test('--force 는 있던 파일을 새 내용으로 바꾼다', async () => {
    const { project } = makeProject('init-force')
    writeFileSync(join(project, 'typeset.config.mjs'), 'old')
    assert.equal(await runCli(['init', '--force'], io(project)), 0)
    assert.match(readFileSync(join(project, 'typeset.config.mjs'), 'utf8'), /export default/)
  })
})

describe('출력 파일 이름', () => {
  const problemsOf = (documents) => validateConfig({ documents }).problems.map((problem) => `${problem.code} ${problem.path}`)
  const document = (extra) => ({ id: 'a', mode: 'book', src: 'a.md', ...extra })
  test('폴더 구분자 · ../ · 점으로 시작하는 out 은 설정 오류다', () => {
    for (const out of ['../x', 'a/b', 'a\\b', '.hidden', 'C:evil']) assert.deepEqual(problemsOf([document({ out })]), ['no-match documents.0.out'], out)
    for (const out of ['guide', '사용 안내서', 'report-2026.v1', '']) assert.deepEqual(problemsOf([document({ out })]), [], out)
  })
  test('두 문서의 출력 이름이 겹치면 설정 오류다(대소문자만 다른 것도 겹친다)', () => {
    assert.deepEqual(problemsOf([document({}), document({ id: 'b', out: 'A' })]), ['duplicate-out documents.1.out'])
    assert.deepEqual(problemsOf([document({ out: 'x' }), document({ id: 'b', out: 'y' })]), [])
  })
})

describe('withinTime', () => {
  test('약속이 먼저 끝나면 그 값을, 상한이 먼저 오면 무엇이 답하지 않았는지 담아 실패한다', async () => {
    assert.equal(await withinTime(Promise.resolve(7), 1000, 'x'), 7)
    await assert.rejects(() => withinTime(new Promise(() => {}), 20, 'PDF printing'), /PDF printing did not answer within 0s/)
  })
})
