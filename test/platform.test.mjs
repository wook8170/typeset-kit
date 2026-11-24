// 플랫폼 도우미 단위 테스트 — 줄바꿈 · 경로 · 실행 파일 찾기 · 진입 판정 · 폴더 지우기를 세 운영체제 기준으로 본다.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/platform.mjs.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, test } from 'node:test'
import {
  executableNames,
  findExecutable,
  isEntryScript,
  isSamePath,
  nullIfMissing,
  pathListSeparator,
  readTextFile,
  removeTree,
  splitLines,
  toLf,
  toPosixPath,
} from '../src/platform.mjs'

describe('줄바꿈', () => {
  test('CRLF · CR 을 LF 로 바꾼다', () => {
    assert.equal(toLf('a\r\nb\rc\nd'), 'a\nb\nc\nd')
    assert.deepEqual(splitLines('a\r\nb'), ['a', 'b'])
  })
  test('파일을 읽을 때 BOM 과 CRLF 를 정리한다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'typeset-kit-test-'))
    const file = join(dir, 'doc.md')
    await writeFile(file, '\uFEFF# 제목\r\n본문\r\n')
    assert.equal(await readTextFile(file), '# 제목\n본문\n')
    await removeTree(dir)
  })
})

describe('경로', () => {
  test('Windows 경로만 / 로 바꾼다', () => {
    assert.equal(toPosixPath('docs\\a\\b.md', 'win32'), 'docs/a/b.md')
    assert.equal(toPosixPath('docs\\a', 'linux'), 'docs\\a')
  })
  test('Windows 는 대소문자 · 구분자를 가리지 않고 같은 곳으로 본다', () => {
    assert.ok(isSamePath('C:\\Work\\A.mjs', 'c:/work/a.mjs', 'win32'))
    assert.ok(!isSamePath('/work/A.mjs', '/work/a.mjs', 'linux'))
  })
  test('직접 실행된 모듈만 진입 스크립트로 본다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'typeset-kit-test-'))
    const file = join(dir, 'entry.mjs')
    await writeFile(file, '')
    // Node 의 import.meta.url 은 링크를 따라간 실제 경로다(macOS 임시 폴더는 /private 아래로 이어진다).
    const moduleUrl = pathToFileURL(realpathSync(file)).href
    assert.ok(isEntryScript(file, moduleUrl))
    assert.ok(!isEntryScript(join(dir, 'missing.mjs'), moduleUrl))
    assert.ok(!isEntryScript(undefined, moduleUrl))
    await removeTree(dir)
  })
})

describe('실행 파일 찾기', () => {
  test('Windows 는 PATHEXT 확장자를 붙인 이름을 먼저 본다', () => {
    assert.deepEqual(executableNames('chrome', { PATHEXT: '.EXE;.CMD' }, 'win32'), ['chrome.exe', 'chrome.cmd', 'chrome'])
    assert.deepEqual(executableNames('chrome', {}, 'linux'), ['chrome'])
  })
  test('PATH 구분자는 Windows 가 ; 이고 나머지는 : 다', () => {
    assert.equal(pathListSeparator('win32'), ';')
    assert.equal(pathListSeparator('darwin'), ':')
  })
  test('PATH 의 앞 폴더부터 찾는다', () => {
    const found = findExecutable('chromium', {
      env: { PATH: '/a:/b' },
      platform: 'linux',
      fileExists: (candidate) => candidate === '/b/chromium',
    })
    assert.equal(found, '/b/chromium')
  })
  test('Windows 는 Path 이름의 환경 변수도 읽는다', () => {
    const found = findExecutable('msedge', {
      env: { Path: 'C:\\x;C:\\y', PATHEXT: '.EXE' },
      platform: 'win32',
      fileExists: (candidate) => candidate === 'C:\\y\\msedge.exe',
    })
    assert.equal(found, 'C:\\y\\msedge.exe')
  })
  test('없으면 null 이다', () => {
    assert.equal(findExecutable('nope', { env: { PATH: '/a' }, platform: 'linux', fileExists: () => false }), null)
  })
})

describe('폴더 지우기', () => {
  test('안에 파일이 있어도 지우고, 없는 폴더는 오류가 아니다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'typeset-kit-test-'))
    await mkdir(join(dir, 'a', 'b'), { recursive: true })
    await writeFile(join(dir, 'a', 'b', 'f'), 'x')
    await removeTree(dir)
    assert.ok(!existsSync(dir))
    await removeTree(dir)
  })
})

describe('없는 파일 다루기', () => {
  test('파일이 없을 때만 null 이고 다른 오류는 그대로 던진다', async () => {
    assert.equal(await nullIfMissing(async () => { throw Object.assign(new Error('x'), { code: 'ENOENT' }) }), null)
    assert.equal(await nullIfMissing(async () => 'value'), 'value')
    await assert.rejects(() => nullIfMissing(async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }) }), /denied/)
  })
})
