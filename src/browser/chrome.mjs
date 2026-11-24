// 브라우저 띄우기 — 헤드리스 브라우저를 임시 프로필로 띄워 CDP 로 붙고, 일이 끝나면 프로세스와 프로필을 지운다.
// 부르는 곳: browser/index.mjs(공개 진입점), doctor/checks.mjs(버전 · 책갈피 점검), 조판 모드(modes/*).
// 먼저 읽을 파일: browser/find.mjs(실행 파일 찾기), browser/print.mjs(문서 넣기 · PDF 굽기).
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { removeTree, WINDOWS } from '../platform.mjs'
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

/** 포트 파일을 아직 읽을 수 없다는 오류 코드. Windows 에서는 브라우저가 파일을 쓰는 동안 열면 잠김(EBUSY · EPERM · EACCES)으로 실패한다. */
const NOT_READY_CODES = ['ENOENT', 'EBUSY', 'EPERM', 'EACCES']

/**
 * 프로필의 DevToolsActivePort 를 읽는다. 아직 없거나 브라우저가 쓰는 중이라 잠겨 있으면 빈 글을 돌려준다(호출 쪽이 다시 읽는다).
 * read 는 테스트에서 파일 읽기 대신 넣는 함수다.
 */
export async function readActivePort(profileDir, read = readFile) {
  try {
    return await read(join(profileDir, 'DevToolsActivePort'), 'utf8')
  } catch (error) {
    if (NOT_READY_CODES.includes(error.code)) return ''
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

/** 프로세스를 끝내는 신호. 이 신호를 받으면 Node 는 finally 를 돌리지 않고 끝난다. */
const EXIT_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP']

/** 신호를 받은 뒤 브라우저가 끝나기를 기다리는 상한(밀리초). 보조 프로세스가 출력 통로를 쥐고 있으면 끝남 알림이 늦게 온다. */
const EXIT_WAIT_MS = 3000

/** 이 프로세스를 그 신호로 끝낸다. Windows 는 자기 자신에게 신호를 보낼 수 없어서 실패 코드로 끝낸다. */
function endBySignal(signal) {
  if (process.platform === WINDOWS) process.exit(1)
  process.kill(process.pid, signal)
}

/**
 * 프로세스가 신호나 process.exit 로 끝날 때 브라우저와 임시 프로필을 지우게 등록한다. 돌려주는 값 = 등록을 푸는 함수.
 * 등록하지 않으면 Ctrl+C · 시간 초과로 끝낸 실행에서 브라우저 프로세스와 프로필 폴더가 남는다.
 * 첫 신호에서는 브라우저가 끝나기를 기다려 프로필을 지운 뒤 같은 신호로 끝낸다. 그래야 부모 프로세스가 「신호로 끝났다」고 본다.
 * 정리하는 동안 신호가 또 오면 기다리지 않고 그 자리에서 지우고 끝낸다. 정리가 끝날 때까지 등록을 풀지 않는 까닭이다.
 * 브라우저의 보조 프로세스는 끝난 직후에도 잠깐 프로필에 쓴다. 그래서 지우기는 다시 시도한다.
 */
function cleanupOnExit(launch, profileDir) {
  const killBrowser = () => {
    if (launch.child.exitCode === null && !launch.spawnError) launch.child.kill('SIGKILL')
  }
  // 기다릴 수 없는 자리(process.exit · 두 번째 신호)에서는 동기로 지우고 다시 시도한다.
  const removeNow = () => {
    killBrowser()
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
  let isEnding = false
  const onSignal = async (signal) => {
    if (isEnding) {
      removeNow()
      release()
      return endBySignal(signal)
    }
    isEnding = true
    killBrowser()
    await Promise.race([launch.ended, new Promise((resolve) => setTimeout(resolve, EXIT_WAIT_MS))])
    await removeTree(profileDir)
    release()
    endBySignal(signal)
  }
  const handlers = EXIT_SIGNALS.map((signal) => [signal, () => onSignal(signal)])
  for (const [signal, handler] of handlers) process.on(signal, handler)
  const release = () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler)
    process.removeListener('exit', removeNow)
  }
  process.once('exit', removeNow)
  return release
}

/**
 * 헤드리스 브라우저를 띄워 fn(cdp, info) 를 부르고, 끝나면(실패해도) 연결 · 프로세스 · 임시 프로필을 정리한다.
 * info = { browserPath, profileDir, pid }. options.browserPath 를 주지 않으면 findBrowser 순서로 찾는다.
 * 도는 중에 프로세스가 신호로 끝나도 브라우저와 프로필을 지운다(cleanupOnExit).
 */
export async function withChrome(fn, { browserPath, env = process.env } = {}) {
  const executable = browserPath ?? findBrowser({ env })
  const profileDir = await mkdtemp(join(tmpdir(), 'typeset-kit-'))
  const launch = startBrowser(executable, profileDir)
  const release = cleanupOnExit(launch, profileDir)
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
    release()
  }
}

/** 브라우저 제품 이름과 버전. 예: { product: 'HeadlessChrome/131.0.6778.85', major: 131 }. */
export async function browserVersion(cdp) {
  const { product } = await cdp.send('Browser.getVersion')
  const major = Number(/\/(\d+)\./.exec(product)?.[1] ?? 0)
  return { product, major }
}
