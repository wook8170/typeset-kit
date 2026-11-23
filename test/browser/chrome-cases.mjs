// 브라우저 모듈의 특성화 사례 — 옮기기 전 조판 엔진과 옮긴 뒤 모듈이 같은 동작을 하는지 같은 사례로 확인한다.
// 부르는 곳: chrome.test.mjs(옮긴 모듈). 옮기기 전 엔진에는 같은 사례를 임시 실행기로 한 번 돌려 통과를 확인했다.
// 먼저 읽을 파일: src/browser/chrome.mjs(확인 대상).
import assert from 'node:assert/strict'

/** 가짜 CDP 연결. 받은 명령을 기록하고, 조판이 끝난 문서처럼 답한다. */
export function createFakeCdp({ meta, pdfParts, pollsBeforeDone = 1, limitMs = 5000 }) {
  const sent = []
  let polls = 0
  let readIndex = 0
  const evaluate = (expression) => {
    if (expression.includes('window.__paged === true')) {
      polls += 1
      return { result: { value: polls > pollsBeforeDone ? 'done' : limitMs } }
    }
    if (expression.startsWith('JSON.stringify({pages')) return { result: { value: JSON.stringify(meta) } }
    return { result: { value: undefined } }
  }
  const answers = {
    'Target.createTarget': () => ({ targetId: 'target-1' }),
    'Target.attachToTarget': () => ({ sessionId: 'session-1' }),
    'Runtime.evaluate': (params) => evaluate(params.expression),
    'Page.printToPDF': () => ({ stream: 'stream-1' }),
    'IO.read': () => {
      const part = pdfParts[readIndex]
      readIndex += 1
      return { data: Buffer.from(part).toString('base64'), base64Encoded: true, eof: readIndex >= pdfParts.length }
    },
  }
  return {
    sent,
    send(method, params = {}, sessionId) {
      sent.push({ method, params, sessionId })
      return Promise.resolve(answers[method] ? answers[method](params) : {})
    },
  }
}

/** 문서 넣기 명령을 기록하는 가짜 call. */
function recordCalls() {
  const expressions = []
  const call = (method, params) => {
    expressions.push({ method, expression: params.expression })
    return Promise.resolve({})
  }
  return { expressions, call }
}

const SAMPLE_META = { pages: 7, front: 2, anchors: { ch0: 4 }, err: null, overflow: [] }

/**
 * 사례 목록. engine = { chromeArgs, openDocument, WRITE_CHUNK, printHtml(cdp, html) }.
 * printHtml 은 엔진마다 다른 입력 꼴(파일 주소 · HTML 글)을 맞추는 어댑터다.
 */
export const chromeCases = [
  {
    name: '브라우저 인자는 헤드리스 · 임시 프로필 · 디버깅 포트를 쓰고 로컬 파일 접근을 허용하지 않는다',
    run(engine) {
      assert.deepEqual(engine.chromeArgs('/tmp/profile-x', 9555), [
        '--headless=new',
        '--user-data-dir=/tmp/profile-x',
        '--remote-debugging-port=9555',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--hide-scrollbars',
        '--window-size=794,1123',
        '--force-device-scale-factor=1',
        'about:blank',
      ])
    },
  },
  {
    name: '문서 넣기는 시간 상한을 먼저 두고 open · write · close 순서로 보낸다',
    async run(engine) {
      const { expressions, call } = recordCalls()
      await engine.openDocument(call, '<p>a</p>', 1234)
      assert.deepEqual(
        expressions.map((entry) => entry.expression),
        ['window.__TYPESET_LIMIT_MS__=1234;document.open();', 'document.write("<p>a</p>")', 'document.close()'],
      )
    },
  },
  {
    name: '시간 상한이 0 이면 상한 변수를 넣지 않는다',
    async run(engine) {
      const { expressions, call } = recordCalls()
      await engine.openDocument(call, 'x', 0)
      assert.equal(expressions[0].expression, 'document.open();')
    },
  },
  {
    name: '큰 문서는 WRITE_CHUNK 글자씩 나눠 넣고 대리 쌍 가운데에서 자르지 않는다',
    async run(engine) {
      const { expressions, call } = recordCalls()
      const size = engine.WRITE_CHUNK
      const html = `${'a'.repeat(size - 1)}😀${'b'.repeat(10)}`
      await engine.openDocument(call, html, 0)
      const writes = expressions.filter((entry) => entry.expression.startsWith('document.write('))
      const parts = writes.map((entry) => JSON.parse(entry.expression.slice('document.write('.length, -1)))
      assert.equal(parts.length, 2)
      assert.equal(parts[0].length, size - 1)
      assert.equal(parts.join(''), html)
    },
  },
  {
    name: 'PDF 굽기는 조판 끝을 기다린 뒤 책갈피를 켜고 스트림으로 받는다',
    async run(engine) {
      const cdp = createFakeCdp({ meta: SAMPLE_META, pdfParts: ['%PDF-1.7 ', 'body'] })
      const { pdf, meta } = await engine.printHtml(cdp, '<p>hi</p>')
      assert.equal(pdf.toString('utf8'), '%PDF-1.7 body')
      assert.deepEqual(meta, SAMPLE_META)
      const print = cdp.sent.find((entry) => entry.method === 'Page.printToPDF')
      assert.deepEqual(print.params, {
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
      assert.equal(print.sessionId, 'session-1')
      const methods = cdp.sent.map((entry) => entry.method)
      assert.equal(methods.at(-1), 'Target.closeTarget')
      assert.ok(methods.includes('IO.close'))
    },
  },
  {
    name: '조판기가 오류를 알리면 PDF 를 굽지 않고 실패한다',
    async run(engine) {
      const cdp = createFakeCdp({ meta: { ...SAMPLE_META, err: 'overflow loop' }, pdfParts: ['x'] })
      await assert.rejects(() => engine.printHtml(cdp, '<p>hi</p>'), /overflow loop/)
      assert.ok(!cdp.sent.some((entry) => entry.method === 'Page.printToPDF'))
    },
  },
]
