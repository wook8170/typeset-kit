// 브라우저 찾기 — 조판에 쓸 Chrome · Chromium · Edge 실행 파일을 정해진 순서로 찾는다.
// 부르는 곳: browser/chrome.mjs(withChrome), doctor/checks.mjs(브라우저 위치 점검).
// 먼저 읽을 파일: src/platform.mjs(경로 · PATH 찾기). 후보 목록(browserCandidates)은 순수 함수다.
import { findExecutable, isFile, pathApiOf } from '../platform.mjs'

const MAC_APPS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]

const WINDOWS_APPS = [
  ['Google', 'Chrome', 'Application', 'chrome.exe'],
  ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
]

const LINUX_COMMANDS = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']

/** Windows 의 설치 위치 후보. Chrome 을 모든 설치 폴더에서 먼저 보고, 그다음 Edge 를 본다. */
function windowsCandidates(env) {
  const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean)
  return WINDOWS_APPS.flatMap((parts) => roots.map((root) => pathApiOf('win32').join(root, ...parts)))
}

/**
 * 찾아볼 후보를 순서대로 돌려준다. 꼴은 { path } (그 파일이 있는지 본다) 또는 { command } (PATH 에서 찾는다)다.
 * 순서: 설정의 경로 → 환경 변수 CHROME_BIN → 운영체제의 기본 위치.
 */
export function browserCandidates({ configuredPath, env, platform }) {
  const explicit = [configuredPath, env.CHROME_BIN].filter(Boolean).map((path) => ({ path, isExplicit: true }))
  if (platform === 'darwin') return [...explicit, ...MAC_APPS.map((path) => ({ path }))]
  if (platform === 'win32') return [...explicit, ...windowsCandidates(env).map((path) => ({ path }))]
  return [...explicit, ...LINUX_COMMANDS.map((command) => ({ command }))]
}

/** 브라우저를 찾지 못했을 때의 오류. 사용자가 할 일(설치 · 경로 지정)을 문구에 담는다. */
export class BrowserNotFoundError extends Error {
  constructor(tried, explicitMissing) {
    const lead = explicitMissing
      ? `Browser not found at the configured path: ${explicitMissing}`
      : 'No Chrome, Chromium or Edge browser was found.'
    super(`${lead}\n${INSTALL_HINT}`)
    this.name = 'BrowserNotFoundError'
    this.tried = tried
  }
}

/** README 와 doctor 가 함께 쓰는 설치 안내. */
export const INSTALL_HINT = [
  '- Desktop: install Chrome or Edge (Windows ships with Edge).',
  '- Server or CI: run `npx @puppeteer/browsers install chrome-headless-shell@stable` and set CHROME_BIN to the printed path.',
  '- Offline network: copy the folder downloaded by the command above and set CHROME_BIN.',
].join('\n')

/**
 * 브라우저 실행 파일의 절대 경로를 돌려준다. 못 찾으면 BrowserNotFoundError 를 던진다.
 * 설정 · 환경 변수로 준 경로에 파일이 없으면 기본 위치로 넘어가지 않고 실패한다. 다른 브라우저로 조용히 굽지 않기 위해서다.
 */
export function findBrowser({ configuredPath, env = process.env, platform = process.platform, fileExists = isFile } = {}) {
  const candidates = browserCandidates({ configuredPath, env, platform })
  const tried = []
  for (const candidate of candidates) {
    if (candidate.command) {
      tried.push(candidate.command)
      const found = findExecutable(candidate.command, { env, platform, fileExists })
      if (found) return found
      continue
    }
    tried.push(candidate.path)
    if (fileExists(candidate.path)) return candidate.path
    if (candidate.isExplicit) throw new BrowserNotFoundError(tried, candidate.path)
  }
  throw new BrowserNotFoundError(tried)
}
