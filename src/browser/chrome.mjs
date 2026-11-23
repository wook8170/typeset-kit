// 브라우저 띄우기 — 헤드리스 브라우저를 임시 프로필로 띄워 CDP 로 붙고, 일이 끝나면 프로세스와 프로필을 지운다.
// 부르는 곳: browser/index.mjs(공개 진입점), doctor/checks.mjs(버전 · 책갈피 점검), 조판 모드(modes/*).
// 먼저 읽을 파일: browser/find.mjs(실행 파일 찾기), browser/print.mjs(문서 넣기 · PDF 굽기).
import { spawn } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { removeTree } from '../platform.mjs'
import { connectCdp } from './cdp.mjs'
import { findBrowser } from './find.mjs'

/** 브라우저가 DevTools 주소를 알릴 때까지 기다리는 상한(밀리초). */
export const LAUNCH_TIMEOUT_MS = 20000
const POLL_MS = 150

/**
 * 조판 브라우저 인자. 헤드리스로만 띄운다. 로컬 파일에 접근하게 하는 인자는 넣지 않는다.
 * 문서는 file:// 로 열지 않고 빈 쪽에 써 넣기 때문이다(print.mjs openDocument).
 * 창 크기는 A4 세로 쪽의 CSS 픽셀 크기다.
 */
export function chromeArgs(profileDir, port) {
  return [
    '--headless=new',
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=794,1123',
    '--force-device-scale-factor=1',
    'about:blank',
  ]
}

/**
 * 프로필 폴더의 DevToolsActivePort 파일 내용 → 웹소켓 주소. 아직 다 쓰이지 않았으면 null 이다.
 * 포트를 0 으로 주면 브라우저가 빈 포트를 골라 이 파일에 적는다. 그래서 포트가 겹쳐 실패하는 일이 없다.
 */
export function webSocketUrlFrom(activePortText) {
  const [port, browserPath] = activePortText.split(/\r?\n/)
  if (!/^\d+$/.test(port ?? '') || !browserPath?.startsWith('/devtools/')) return null
  return `ws://127.0.0.1:${port}${browserPath}`
}

async function readActivePort(profileDir) {
  try {
    return await readFile(join(profileDir, 'DevToolsActivePort'), 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return ''
    throw error
  }
}

async function waitForDevTools(profileDir, launch) {
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (launch.spawnError) throw new Error(`Browser could not start: ${launch.spawnError.message}`)
    if (launch.child.exitCode !== null) {
      throw new Error(`Browser exited with code ${launch.child.exitCode}.\n${launch.stderrTail()}`)
    }
    const url = webSocketUrlFrom(await readActivePort(profileDir))
    if (url) return url
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
  throw new Error(`Browser did not open DevTools within ${LAUNCH_TIMEOUT_MS / 1000}s.\n${launch.stderrTail()}`)
}

/**
 * 브라우저 프로세스를 띄운다. 돌려주는 값 = { child, ended, stderrTail, spawnError }.
 * 실행 파일을 열지 못하면 Node 는 exit 없이 error · close 를 낸다. 그래서 error 를 받아 두고, 끝남은 close 로 기다린다.
 */
function startBrowser(executable, profileDir) {
  const child = spawn(executable, chromeArgs(profileDir, 0), { stdio: ['ignore', 'ignore', 'pipe'] })
  let tail = ''
  child.stderr.on('data', (chunk) => {
    tail = (tail + chunk.toString()).slice(-2000)
  })
  const launch = { child, spawnError: null, stderrTail: () => tail.trim() }
  launch.ended = new Promise((resolve) => child.once('close', resolve))
  child.once('error', (error) => {
    launch.spawnError = error
  })
  return launch
}

/**
 * 헤드리스 브라우저를 띄워 fn(cdp, info) 를 부르고, 끝나면(실패해도) 연결 · 프로세스 · 임시 프로필을 정리한다.
 * info = { browserPath, profileDir, pid }. options.browserPath 를 주지 않으면 findBrowser 순서로 찾는다.
 */
export async function withChrome(fn, { browserPath, env = process.env } = {}) {
  const executable = browserPath ?? findBrowser({ env })
  const profileDir = await mkdtemp(join(tmpdir(), 'typeset-kit-'))
  const launch = startBrowser(executable, profileDir)
  try {
    const cdp = await connectCdp(await waitForDevTools(profileDir, launch))
    try {
      return await fn(cdp, { browserPath: executable, profileDir, pid: launch.child.pid })
    } finally {
      cdp.close()
    }
  } finally {
    if (launch.child.exitCode === null && !launch.spawnError) launch.child.kill('SIGKILL')
    await launch.ended
    await removeTree(profileDir)
  }
}

/** 브라우저 제품 이름과 버전. 예: { product: 'HeadlessChrome/131.0.6778.85', major: 131 }. */
export async function browserVersion(cdp) {
  const { product } = await cdp.send('Browser.getVersion')
  const major = Number(/\/(\d+)\./.exec(product)?.[1] ?? 0)
  return { product, major }
}
