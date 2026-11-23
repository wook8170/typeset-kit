// 브라우저 찾기 단위 테스트 — 운영체제마다 후보 순서와, 설정 경로가 틀렸을 때 다른 브라우저로 넘어가지 않는 규칙.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/browser/find.mjs.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { browserCandidates, BrowserNotFoundError, findBrowser, INSTALL_HINT } from '../../src/browser/find.mjs'

const existsOnly = (...paths) => (candidate) => paths.includes(candidate)

describe('후보 순서', () => {
  test('설정 경로 → CHROME_BIN → 기본 위치 순서다', () => {
    const candidates = browserCandidates({ configuredPath: '/opt/a', env: { CHROME_BIN: '/opt/b' }, platform: 'darwin' })
    assert.deepEqual(candidates.slice(0, 2).map((item) => item.path), ['/opt/a', '/opt/b'])
    assert.match(candidates[2].path, /Google Chrome\.app/)
    assert.match(candidates.at(-1).path, /Microsoft Edge\.app/)
  })
  test('Windows 는 설치 폴더 세 곳의 Chrome 을 본 뒤 Edge 를 본다', () => {
    const env = { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }
    const paths = browserCandidates({ env, platform: 'win32' }).map((item) => item.path)
    assert.deepEqual(paths, [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Users\\u\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Users\\u\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe',
    ])
  })
  test('Linux 는 PATH 에서 명령 이름으로 찾는다', () => {
    const commands = browserCandidates({ env: {}, platform: 'linux' }).map((item) => item.command)
    assert.deepEqual(commands.slice(0, 3), ['google-chrome', 'google-chrome-stable', 'chromium'])
  })
})

describe('찾기', () => {
  test('macOS 에 Chrome 이 없고 Edge 만 있으면 Edge 를 고른다', () => {
    const edge = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    assert.equal(findBrowser({ env: {}, platform: 'darwin', fileExists: existsOnly(edge) }), edge)
  })
  test('Windows 에서 Edge 만 있으면 Edge 를 고른다', () => {
    const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    const env = { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' }
    assert.equal(findBrowser({ env, platform: 'win32', fileExists: existsOnly(edge) }), edge)
  })
  test('Linux 는 PATH 의 폴더에서 찾는다', () => {
    const env = { PATH: '/usr/local/bin:/usr/bin' }
    assert.equal(findBrowser({ env, platform: 'linux', fileExists: existsOnly('/usr/bin/chromium') }), '/usr/bin/chromium')
  })
  test('CHROME_BIN 에 파일이 없으면 기본 위치로 넘어가지 않고 실패한다', () => {
    const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    assert.throws(
      () => findBrowser({ env: { CHROME_BIN: '/nope/chrome' }, platform: 'darwin', fileExists: existsOnly(chrome) }),
      (error) => error instanceof BrowserNotFoundError && error.message.includes('/nope/chrome'),
    )
  })
  test('아무것도 없으면 설치 안내를 담아 실패한다', () => {
    assert.throws(
      () => findBrowser({ env: { PATH: '/usr/bin' }, platform: 'linux', fileExists: () => false }),
      (error) => error instanceof BrowserNotFoundError && error.message.includes(INSTALL_HINT) && error.tried.length > 0,
    )
  })
})
