// 글롭 시험 — `*` · `**` · `?` 가 폴더 경계를 올바로 다루고, node_modules 를 훑지 않는지 확인한다.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/writing/glob.mjs.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { removeTree } from '../../src/platform.mjs'
import { expandGlob, globToRegExp, isGlob } from '../../src/writing/glob.mjs'

describe('글롭', () => {
  test('패턴 → 정규식: * 는 폴더 안, ** 는 폴더를 넘는다', () => {
    assert.ok(globToRegExp('docs/*.md').test('docs/a.md'))
    assert.ok(!globToRegExp('docs/*.md').test('docs/sub/a.md'))
    assert.ok(globToRegExp('docs/**/*.md').test('docs/a.md'))
    assert.ok(globToRegExp('docs/**/*.md').test('docs/sub/deep/a.md'))
    assert.ok(globToRegExp('a?.md').test('ab.md'))
    assert.ok(!globToRegExp('a.md').test('axmd'))
  })
  test('글롭 문자가 없으면 글롭이 아니다', () => {
    assert.equal(isGlob('docs/a.md'), false)
    assert.equal(isGlob('docs/*.md'), true)
  })
  test('root 아래 파일을 정렬해서 돌려주고 node_modules 는 건너뛴다', async () => {
    const root = await mkdtemp(join(tmpdir(), 'typeset-kit-glob-'))
    await mkdir(join(root, 'docs', 'sub'), { recursive: true })
    await mkdir(join(root, 'node_modules', 'x'), { recursive: true })
    for (const file of ['docs/b.md', 'docs/a.md', 'docs/sub/c.md', 'node_modules/x/d.md']) await writeFile(join(root, file), '')
    assert.deepEqual(expandGlob(root, 'docs/**/*.md'), ['docs/a.md', 'docs/b.md', 'docs/sub/c.md'])
    assert.deepEqual(expandGlob(root, '**/*.md'), ['docs/a.md', 'docs/b.md', 'docs/sub/c.md'])
    assert.deepEqual(expandGlob(root, 'none/*.md'), [])
    await removeTree(root)
  })
})
