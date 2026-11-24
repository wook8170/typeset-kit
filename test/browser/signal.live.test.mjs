// 신호 정리 시험 — 조판 중인 프로세스가 SIGTERM · SIGINT 로 끝나도 브라우저 프로세스와 임시 프로필이 남지 않는지 실제 브라우저로 확인한다.
// 부르는 곳: npm test. 브라우저가 없는 환경과 Windows 에서는 건너뛴다(Windows 는 신호를 받는 쪽 코드를 돌리지 않고 바로 끝낸다).
// 먼저 읽을 파일: src/browser/chrome.mjs(cleanupOnExit).
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { browserSkipReason } from '../fixtures/browser.mjs'

const CHROME_MODULE = fileURLToPath(new URL('../../src/browser/chrome.mjs', import.meta.url))

/** 브라우저를 띄운 뒤 끝나지 않는 자식 스크립트. 띄운 브라우저의 pid 와 프로필 폴더를 한 줄로 알린다. */
const HANGING_SCRIPT = `
import { pathToFileURL } from 'node:url'
const { withChrome } = await import(pathToFileURL(process.argv[1]).href)
await withChrome((cdp, info) => {
  console.log(JSON.stringify({ pid: info.pid, profileDir: info.profileDir }))
  return new Promise(() => setInterval(() => {}, 1000))
})
`

const isAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
    return false
  }
}

/** 자식을 띄워 브라우저 정보를 받은 뒤 신호를 보내고, 자식이 끝날 때까지 기다린다. */
function runAndSignal(signal, { repeatAfterMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', HANGING_SCRIPT, CHROME_MODULE], { stdio: ['ignore', 'pipe', 'inherit'] })
    let info = null
    child.stdout.on('data', (chunk) => {
      info = JSON.parse(chunk.toString().trim())
      child.kill(signal)
      // 정리하는 동안 같은 신호가 한 번 더 오는 경우(Ctrl+C 를 두 번 누름)
      if (repeatAfterMs > 0) setTimeout(() => child.exitCode === null && child.signalCode === null && child.kill(signal), repeatAfterMs)
    })
    child.once('error', reject)
    child.once('close', (code, endedBy) => resolve({ info, code, endedBy }))
  })
}

async function waitUntilGone(pid) {
  for (let tries = 0; tries < 50 && isAlive(pid); tries += 1) await new Promise((resolve) => setTimeout(resolve, 100))
  return !isAlive(pid)
}

const skip = browserSkipReason() || (process.platform === 'win32' ? 'signals end the process at once on Windows' : false)

describe('신호로 끝날 때의 정리', { skip, timeout: 60000 }, () => {
  for (const signal of ['SIGTERM', 'SIGINT']) {
    test(`${signal}: 브라우저 프로세스와 임시 프로필이 남지 않고, 프로세스는 그 신호로 끝난 것으로 보인다`, async () => {
      const { info, endedBy } = await runAndSignal(signal)
      assert.ok(info?.pid > 0, 'browser did not start')
      assert.equal(endedBy, signal)
      assert.ok(await waitUntilGone(info.pid), 'browser process left behind')
      assert.ok(!existsSync(info.profileDir), 'profile folder left behind')
    })
  }
  test('정리하는 동안 신호가 한 번 더 와도 프로필이 남지 않는다', async () => {
    const { info } = await runAndSignal('SIGTERM', { repeatAfterMs: 150 })
    assert.ok(info?.pid > 0, 'browser did not start')
    assert.ok(await waitUntilGone(info.pid), 'browser process left behind')
    assert.ok(!existsSync(info.profileDir), 'profile folder left behind')
  })
})
