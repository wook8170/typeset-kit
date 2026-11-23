// 브라우저 모듈 단위 테스트 — 옮기기 전 엔진과 같은 특성화 사례, 그리고 새로 더한 판정 함수(주소 읽기 · 대기 상한).
// 부르는 곳: npm test.
// 먼저 읽을 파일: test/browser/chrome-cases.mjs(특성화 사례), src/browser/print.mjs.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { chromeArgs, webSocketUrlFrom, withChrome } from '../../src/browser/chrome.mjs'
import { INITIAL_WAIT_MS, openDocument, printPdf, WAIT_MARGIN_MS, waitDeadline, WRITE_CHUNK } from '../../src/browser/print.mjs'
import { chromeCases, createFakeCdp } from './chrome-cases.mjs'

const engine = { chromeArgs, openDocument, WRITE_CHUNK, printHtml: (cdp, html) => printPdf(cdp, html) }

describe('특성화: 옮기기 전 엔진과 같은 동작', () => {
  for (const item of chromeCases) test(item.name, () => item.run(engine))
})

describe('DevToolsActivePort 읽기', () => {
  test('포트와 브라우저 경로로 웹소켓 주소를 만든다', () => {
    assert.equal(webSocketUrlFrom('51234\n/devtools/browser/abc\n'), 'ws://127.0.0.1:51234/devtools/browser/abc')
  })
  test('CRLF 로 적혀도 읽는다', () => {
    assert.equal(webSocketUrlFrom('51234\r\n/devtools/browser/abc'), 'ws://127.0.0.1:51234/devtools/browser/abc')
  })
  test('아직 다 쓰이지 않은 파일은 null 이다', () => {
    assert.equal(webSocketUrlFrom(''), null)
    assert.equal(webSocketUrlFrom('51234'), null)
    assert.equal(webSocketUrlFrom('x\n/devtools/browser/abc'), null)
  })
})

describe('조판 대기 상한', () => {
  test('고정 상한이 있으면 그 값에 여유를 더한다', () => {
    assert.equal(waitDeadline({ startedAt: 1000, fixedLimitMs: 5000, reportedLimitMs: 0 }), 1000 + 5000 + WAIT_MARGIN_MS)
  })
  test('스크립트가 상한을 알리기 전에는 처음 대기 상한을 쓴다', () => {
    assert.equal(waitDeadline({ startedAt: 0, fixedLimitMs: 0, reportedLimitMs: 0 }), INITIAL_WAIT_MS)
  })
  test('알린 상한이 크면 그 값 + 여유로 늘리고, 작으면 처음 상한을 지킨다', () => {
    assert.equal(waitDeadline({ startedAt: 0, fixedLimitMs: 0, reportedLimitMs: 300000 }), 300000 + WAIT_MARGIN_MS)
    assert.equal(waitDeadline({ startedAt: 0, fixedLimitMs: 0, reportedLimitMs: 10 }), INITIAL_WAIT_MS)
  })
})

describe('PDF 굽기 정리', () => {
  test('조판이 실패해도 연 탭을 닫는다', async () => {
    const cdp = createFakeCdp({ meta: { pages: 1, front: 0, anchors: {}, err: 'boom', overflow: [] }, pdfParts: ['x'] })
    await assert.rejects(() => printPdf(cdp, '<p>x</p>'), /boom/)
    assert.equal(cdp.sent.at(-1).method, 'Target.closeTarget')
  })
  test('timeoutMs 를 주면 문서 앞에 시간 상한 변수를 둔다', async () => {
    const cdp = createFakeCdp({ meta: { pages: 1, front: 0, anchors: {}, err: null, overflow: [] }, pdfParts: ['x'] })
    await printPdf(cdp, '<p>x</p>', { timeoutMs: 777 })
    const first = cdp.sent.find((entry) => entry.params.expression?.includes('document.open'))
    assert.equal(first.params.expression, 'window.__TYPESET_LIMIT_MS__=777;document.open();')
  })
})

describe('브라우저 띄우기 실패', () => {
  test('실행 파일을 열 수 없으면 기다리지 않고 까닭을 담아 실패한다', async () => {
    const startedAt = Date.now()
    await assert.rejects(
      () => withChrome(() => assert.fail('fn must not run'), { browserPath: '/no/such/browser' }),
      /Browser could not start: .*ENOENT/,
    )
    assert.ok(Date.now() - startedAt < 5000)
  })
})
