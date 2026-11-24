// 글쓰기 검사 흐름 시험 — 임시 프로젝트에서 세 종류 원고를 훑고, 래칫(report · check · update-baseline) · 허용 · 끄기를 확인한다.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/writing/index.mjs.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { validateConfig } from '../../src/config/validate.mjs'
import { checkWriting as checkWritingViaIndex } from '../../src/index.mjs'
import { removeTree } from '../../src/platform.mjs'
import { checkWriting } from '../../src/writing/index.mjs'

const SPEC_SOURCE = "export default { title: '안내서', chapters: [{ no: '1', title: '장', sections: [{ no: '1.1', title: '절', blocks: [{ t: 'p', html: '강력한 기능' }] }] }] }\n"

/** 세 종류 원고(book · spec · pages)와 globs 대상이 한 벌씩 든 프로젝트. 원고마다 과장 표현 「강력한」 이 한 번 들어 있다. */
async function makeProject(writing = {}) {
  const root = await mkdtemp(join(tmpdir(), 'typeset-kit-writing-'))
  await mkdir(join(root, 'docs'), { recursive: true })
  await writeFile(join(root, 'docs', 'book.md'), '# 책\n\n강력한 도구다.\n\n```\n강력한 코드\n```\n')
  await writeFile(join(root, 'docs', 'spec.mjs'), SPEC_SOURCE)
  await writeFile(join(root, 'docs', 'page.html'), '<style>.강력한{}</style>\n<p>강력한 쪽</p>\n')
  await writeFile(join(root, 'docs', 'extra.md'), '추가 글에도 강력한 표현\n')
  const raw = {
    documents: [
      { id: 'book', mode: 'book', src: 'docs/book.md' },
      { id: 'spec', mode: 'spec', src: 'docs/spec.mjs' },
      { id: 'pages', mode: 'pages', src: 'docs/*.html' },
    ],
    writing: { globs: ['docs/extra.md'], ...writing },
  }
  const { config } = validateConfig(raw)
  return { root, config }
}

const filesOf = (result) => result.findings.map((finding) => finding.file).sort()

describe('대상 글 세 종류', () => {
  test('book · spec · pages 원고와 globs 의 글에서 모두 찾고 코드 · 스타일은 뺀다', async () => {
    const { root, config } = await makeProject()
    const result = await checkWriting({ root, config, mode: 'report' })
    assert.deepEqual(filesOf(result), ['docs/book.md', 'docs/extra.md', 'docs/page.html', 'docs/spec.mjs'])
    assert.ok(result.findings.every((finding) => finding.rule === 'hype' && finding.level === 'ratchet'))
    assert.equal(result.findings.find((finding) => finding.file === 'docs/book.md').line, 3)
    assert.equal(result.findings.find((finding) => finding.file === 'docs/page.html').line, 2)
    assert.equal(result.hasProblems, false)
    await removeTree(root)
  })
  test('documents[].writing 이 false 인 문서는 뺀다', async () => {
    const { root, config } = await makeProject()
    config.documents[0].writing = false
    assert.ok(!filesOf(await checkWriting({ root, config, mode: 'report' })).includes('docs/book.md'))
    await removeTree(root)
  })
  test('없는 원고 파일은 오류로 알린다', async () => {
    const { root, config } = await makeProject()
    config.documents[0].src = 'docs/none.md'
    await assert.rejects(() => checkWriting({ root, config, mode: 'report' }), /source file not found: docs\/none.md/)
    await removeTree(root)
  })
})

describe('래칫', () => {
  test('기준선이 없으면 check 는 모두 늘어난 것으로 보고 실패한다', async () => {
    const { root, config } = await makeProject()
    const result = await checkWriting({ root, config, mode: 'check' })
    assert.equal(result.hasProblems, true)
    assert.equal(result.regressed.length, 4)
    await removeTree(root)
  })
  test('update-baseline 으로 잠그면 check 가 통과하고, 위반이 늘면 실패하고, 줄면 재잠금을 알린다', async () => {
    const { root, config } = await makeProject()
    const locked = await checkWriting({ root, config, mode: 'update-baseline' })
    assert.equal(locked.hasProblems, false)
    const saved = JSON.parse(await readFile(join(root, 'typeset.writing-baseline.json'), 'utf8'))
    assert.equal(saved.total, 4)
    assert.deepEqual(Object.keys(saved.rules), ['hype'])

    const same = await checkWriting({ root, config, mode: 'check' })
    assert.deepEqual([same.hasProblems, same.findings.length, same.regressed.length], [false, 0, 0])

    await writeFile(join(root, 'docs', 'book.md'), '강력한 도구와 강력한 방법\n')
    const grown = await checkWriting({ root, config, mode: 'check' })
    assert.equal(grown.hasProblems, true)
    assert.deepEqual(grown.regressed, [{ rule: 'hype', file: 'docs/book.md', was: 1, now: 2 }])
    assert.equal(grown.findings.length, 2)

    await writeFile(join(root, 'docs', 'book.md'), '고쳤다\n')
    const shrunk = await checkWriting({ root, config, mode: 'check' })
    assert.equal(shrunk.hasProblems, false)
    assert.deepEqual(shrunk.improved, [{ rule: 'hype', file: 'docs/book.md', was: 1, now: 0 }])
    await removeTree(root)
  })
  test('baseline 칸으로 기준선 파일 위치를 바꿀 수 있다', async () => {
    const { root, config } = await makeProject({ baseline: 'docs/base.json' })
    await checkWriting({ root, config, mode: 'update-baseline' })
    assert.equal(JSON.parse(await readFile(join(root, 'docs', 'base.json'), 'utf8')).total, 4)
    await removeTree(root)
  })
})

describe('규칙 모드와 끄기', () => {
  test('warn 은 늘어도 실패가 아니고, fail 은 report 에서도 실패다', async () => {
    const warned = await makeProject({ rules: { hype: 'warn' } })
    const warnResult = await checkWriting({ ...warned, mode: 'check' })
    assert.equal(warnResult.findings.length, 4)
    assert.equal(warnResult.hasProblems, false)
    const failed = await makeProject({ rules: { hype: 'fail' } })
    assert.equal((await checkWriting({ ...failed, mode: 'report' })).hasProblems, true)
    await removeTree(warned.root)
    await removeTree(failed.root)
  })
  test('off 인 묶음과 languages: [] 는 아무것도 찾지 않는다', async () => {
    const off = await makeProject({ rules: { hype: 'off' } })
    assert.equal((await checkWriting({ ...off, mode: 'report' })).findings.length, 0)
    const disabled = await makeProject({ languages: [] })
    assert.deepEqual(await checkWriting({ ...disabled, mode: 'check' }), { findings: [], hasProblems: false, regressed: [], improved: [] })
    await removeTree(off.root)
    await removeTree(disabled.root)
  })
  test('allow 는 지정한 파일 · 규칙만 빼고, * 는 그 파일의 모든 규칙을 뺀다', async () => {
    const project = await makeProject({ allow: [{ file: 'docs/book.md', rule: 'hype', reason: '인용' }, { file: 'docs/extra.md', rule: '*', reason: '용어 풀이' }] })
    assert.deepEqual(filesOf(await checkWriting({ ...project, mode: 'report' })), ['docs/page.html', 'docs/spec.mjs'])
    await removeTree(project.root)
  })
  test('rules 에 모르는 묶음 이름이 있으면 오류다', async () => {
    const project = await makeProject({ rules: { hipe: 'warn' } })
    await assert.rejects(() => checkWriting({ ...project, mode: 'report' }), /Unknown writing rule.*hipe/)
    await removeTree(project.root)
  })
  test('영어 문서는 languages: [en] 으로 영어 규칙만 적용한다', async () => {
    const project = await makeProject({ languages: ['en'], globs: ['docs/en.md'] })
    await writeFile(join(project.root, 'docs', 'en.md'), 'A robust tool.\n강력한 한글 줄\n')
    const result = await checkWriting({ ...project, mode: 'report' })
    assert.deepEqual(result.findings.map((finding) => [finding.file, finding.text]), [['docs/en.md', 'robust']])
    await removeTree(project.root)
  })
})

describe('공개 진입점', () => {
  test('src/index.mjs 의 checkWriting 이 설정 파일을 읽어 같은 결과를 낸다', async () => {
    const { root } = await makeProject()
    await writeFile(join(root, 'typeset.config.json'), JSON.stringify({ documents: [{ id: 'book', mode: 'book', src: 'docs/book.md' }] }))
    const result = await checkWritingViaIndex({ cwd: root, mode: 'report' })
    assert.deepEqual(filesOf(result), ['docs/book.md'])
    await removeTree(root)
  })
})
