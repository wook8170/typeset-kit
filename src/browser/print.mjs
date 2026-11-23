// 문서 넣기와 PDF 굽기 — 조판 HTML 을 빈 쪽에 써 넣고, 쪽 나누기 스크립트가 끝나기를 기다린 뒤 PDF 로 굽는다.
// 부르는 곳: browser/index.mjs(공개 진입점), 조판 모드(modes/*), doctor/checks.mjs(책갈피 점검).
// 먼저 읽을 파일: docs/contract.md 「쪽 나누기 스크립트가 알리는 값」(기다리는 창 변수의 뜻).

/** 문서를 넣는 CDP 명령 하나에 싣는 글자 수. 100MB 를 넘는 문서를 한 명령에 실으면 답이 오지 않았다. */
export const WRITE_CHUNK = 4 * 1024 * 1024
/** PDF 를 스트림에서 한 번에 읽는 바이트 수. 수 MB 를 한 웹소켓 프레임으로 받으면 답이 오지 않는다. */
export const READ_CHUNK = 512 * 1024
/** 쪽 나누기 스크립트가 시간 상한을 알리기 전의 대기 상한. */
export const INITIAL_WAIT_MS = 60000
/** 스크립트의 시간 상한에 더하는 여유. 글꼴 준비와 문서 읽기에 드는 시간이다. */
export const WAIT_MARGIN_MS = 35000
const POLL_MS = 200

/** printToPDF 인자. 여백은 문서 CSS 가 갖는다. 책갈피(generateDocumentOutline)는 장 · 절 제목에서 만든다. */
export const PRINT_PARAMS = Object.freeze({
  printBackground: true,
  preferCSSPageSize: true,
  marginTop: 0,
  marginBottom: 0,
  marginLeft: 0,
  marginRight: 0,
  displayHeaderFooter: false,
  generateDocumentOutline: true,
  transferMode: 'ReturnAsStream',
})

/**
 * 빈 쪽(about:blank)에 HTML 을 넣어 연다. file:// 로 열지 않으므로 문서의 원점이 로컬 파일 밖이고,
 * 하위 자원이 로컬 파일에 닿지 못한다. document.open · write · close 를 WRITE_CHUNK 씩 나눠 한다.
 * 시간 상한은 document.open 앞에 창 변수로 둔다. document.open 은 창 객체를 바꾸지 않아서 넣은 문서가 그 값을 읽는다.
 */
export async function openDocument(call, html, fixedLimitMs) {
  const limitPrefix = fixedLimitMs > 0 ? `window.__TYPESET_LIMIT_MS__=${fixedLimitMs};` : ''
  await call('Runtime.evaluate', { expression: `${limitPrefix}document.open();` })
  for (let start = 0; start < html.length; ) {
    let end = Math.min(start + WRITE_CHUNK, html.length)
    // UTF-16 대리 쌍 가운데에서 자르지 않는다
    if (end < html.length && /[\uD800-\uDBFF]/.test(html[end - 1])) end -= 1
    await call('Runtime.evaluate', { expression: `document.write(${JSON.stringify(html.slice(start, end))})` })
    start = end
  }
  await call('Runtime.evaluate', { expression: 'document.close()' })
}

/**
 * 대기 상한을 정한다(순수 함수). 고정 상한이 있으면 그 값 + 여유, 없으면 처음에는 INITIAL_WAIT_MS 이고,
 * 스크립트가 자기 상한을 알리면 그 값 + 여유로 늘린다. 큰 문서에서 대기가 스크립트보다 먼저 끝나지 않게 하기 위해서다.
 */
export function waitDeadline({ startedAt, fixedLimitMs, reportedLimitMs }) {
  if (fixedLimitMs > 0) return startedAt + fixedLimitMs + WAIT_MARGIN_MS
  const initial = startedAt + INITIAL_WAIT_MS
  return reportedLimitMs > 0 ? Math.max(initial, startedAt + reportedLimitMs + WAIT_MARGIN_MS) : initial
}

async function waitForTypeset(call, { startedAt, fixedLimitMs }) {
  let reportedLimitMs = 0
  for (;;) {
    const answer = await call('Runtime.evaluate', {
      expression: "window.__paged === true ? 'done' : (window.__typesetLimitMs || 0)",
      returnByValue: true,
    })
    const value = answer.result.value
    if (value === 'done') return
    if (value > 0) reportedLimitMs = value
    const deadline = waitDeadline({ startedAt, fixedLimitMs, reportedLimitMs })
    if (Date.now() > deadline) {
      throw new Error(`Typesetting did not finish within ${Math.round((deadline - startedAt) / 1000)}s`)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

async function readTypesetMeta(call) {
  const answer = await call('Runtime.evaluate', {
    expression:
      'JSON.stringify({pages:window.__pageCount,front:window.__frontCount,anchors:window.__anchors,err:window.__err||null,overflow:window.__overflow||[]})',
    returnByValue: true,
  })
  const meta = JSON.parse(answer.result.value)
  if (meta.err) throw new Error(`Typesetting failed: ${meta.err}`)
  return meta
}

async function readStream(call, handle) {
  const chunks = []
  for (;;) {
    const part = await call('IO.read', { handle, size: READ_CHUNK })
    if (part.data) chunks.push(Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8'))
    if (part.eof) break
  }
  await call('IO.close', { handle })
  return Buffer.concat(chunks)
}

/**
 * 조판 HTML 한 벌을 PDF 로 굽는다. 새 탭을 열고, 문서를 넣고, 쪽 나누기 스크립트가 끝나면 굽고, 탭을 닫는다.
 * options.timeoutMs 는 스크립트 시간 상한을 직접 정한다(0 이면 스크립트가 문서 크기에 비례해 정한다).
 * 돌려주는 값 = { pdf: Buffer, meta: { pages, front, anchors, overflow } }.
 */
export async function printPdf(cdp, html, { timeoutMs = 0 } = {}) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const call = (method, params) => cdp.send(method, params, sessionId)
  try {
    await call('Page.enable')
    await call('Runtime.enable')
    const startedAt = Date.now()
    await openDocument(call, html, timeoutMs)
    await waitForTypeset(call, { startedAt, fixedLimitMs: timeoutMs })
    await call('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true })
    const meta = await readTypesetMeta(call)
    const { stream } = await call('Page.printToPDF', { ...PRINT_PARAMS })
    return { pdf: await readStream(call, stream), meta }
  } finally {
    await cdp.send('Target.closeTarget', { targetId })
  }
}
