// 설정 읽기 · 문서별 설정 단위 테스트 — 파일 찾기 순서, .mjs · .json 읽기, 오류, 문서 고르기와 덮어쓰기 합치기.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/config/load.mjs, src/config/document.mjs.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { documentSettings, mergeOverride, selectDocuments, UnknownDocumentError } from '../../src/config/document.mjs'
import { ConfigError, findConfigFile, loadConfig } from '../../src/config/load.mjs'
import { validateConfig } from '../../src/config/validate.mjs'
import { removeTree } from '../../src/platform.mjs'

const makeDir = () => mkdtemp(join(tmpdir(), 'typeset-kit-test-'))

describe('설정 파일 읽기', () => {
  test('아래 폴더에서 위로 올라가며 찾고, .mjs 가 .json 보다 먼저다', async () => {
    const dir = await makeDir()
    await mkdir(join(dir, 'docs', 'deep'), { recursive: true })
    await writeFile(join(dir, 'typeset.config.json'), '{"documents":[]}')
    await writeFile(join(dir, 'typeset.config.mjs'), 'export default { documents: [] }')
    assert.equal(findConfigFile(join(dir, 'docs', 'deep')), join(dir, 'typeset.config.mjs'))
    await removeTree(dir)
  })
  test('.mjs 설정을 가져와 기본값을 채우고 root 를 설정 폴더로 둔다', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, 'typeset.config.mjs'), "export default { locale: 'en', documents: [{ id: 'a', mode: 'spec', src: 'a.mjs' }] }")
    const { root, config } = await loadConfig({ cwd: dir })
    assert.equal(root, dir)
    assert.equal(config.locale, 'en')
    assert.equal(config.documents[0].mode, 'spec')
    await removeTree(dir)
  })
  test('JSON 이 깨졌으면 invalid-json 이다', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, 'typeset.config.json'), '{ nope')
    await assert.rejects(() => loadConfig({ cwd: dir }), (error) => error instanceof ConfigError && error.problems[0].code === 'invalid-json')
    await removeTree(dir)
  })
  test('설정이 없으면 config-not-found, 스키마에 맞지 않으면 문제를 모두 담는다', async () => {
    const dir = await makeDir()
    await assert.rejects(() => loadConfig({ cwd: dir }), (error) => error.problems[0].code === 'config-not-found')
    await writeFile(join(dir, 'typeset.config.json'), '{"documents":[],"locale":"jp","x":1}')
    await assert.rejects(
      () => loadConfig({ cwd: dir }),
      (error) => error instanceof ConfigError && error.problems.length === 2 && error.file.endsWith('typeset.config.json'),
    )
    await removeTree(dir)
  })
})

describe('문서 고르기와 설정 합치기', () => {
  const { config } = validateConfig({
    brand: { name: 'Acme Docs' },
    documents: [
      { id: 'a', mode: 'book', src: 'a.md', title: 'A', theme: { hue: 30, fonts: { mono: 'builtin:other' } } },
      { id: 'b', mode: 'pages', src: 'b/*.html' },
    ],
  })
  test('id 를 주지 않으면 모두, 주면 그 문서만 고른다', () => {
    assert.equal(selectDocuments(config.documents).length, 2)
    assert.deepEqual(selectDocuments(config.documents, ['b']).map((document) => document.id), ['b'])
  })
  test('없는 id 가 있으면 아무것도 고르지 않고 실패한다', () => {
    assert.throws(() => selectDocuments(config.documents, ['b', 'zz']), (error) => error instanceof UnknownDocumentError && error.unknownIds[0] === 'zz')
  })
  test('문서 설정은 전역 값에 문서의 덮어쓰기를 합친다', () => {
    const settings = documentSettings(config, config.documents[0])
    assert.equal(settings.theme.hue, 30)
    assert.deepEqual(settings.theme.fonts, { sans: 'builtin:noto-sans-kr', mono: 'builtin:other' })
    assert.equal(settings.theme.page.orientation, 'portrait')
    assert.equal(settings.brand.name, 'Acme Docs')
    assert.equal(settings.title, 'A')
    assert.equal(documentSettings(config, config.documents[1]).theme.hue, 250)
  })
  test('합치기는 배열을 통째로 바꾸고 원본을 바꾸지 않는다', () => {
    const base = { list: [1, 2], nested: { a: 1, b: 2 } }
    const merged = mergeOverride(base, { list: [3], nested: { b: 9 } })
    assert.deepEqual(merged, { list: [3], nested: { a: 1, b: 9 } })
    assert.deepEqual(base, { list: [1, 2], nested: { a: 1, b: 2 } })
  })
})
