// 내용 보안 정책 테스트 — 정책 문자열, 조판 HTML 의 정책 위치와 해시, 헤드리스 브라우저에서 그림에 섞인 스크립트가 막히는지.
// 부르는 곳: npm test. 브라우저가 없으면 브라우저 항목만 건너뛴다.
// 먼저 읽을 파일: src/render/csp.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withChrome } from '../../src/browser/chrome.mjs'
import { openDocument, printPdf } from '../../src/browser/print.mjs'
import { cspMeta, cspPolicy, scriptHash } from '../../src/render/csp.mjs'
import { renderPrintHtml } from '../../src/render/index.mjs'
import { browserSkipReason } from '../fixtures/browser.mjs'
import { variantSettings, virtualSpec } from '../fixtures/virtual-book.mjs'

const scriptsOf = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1])
const policyOf = (html) => /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1]

test('정책 문자열: 해시만 허용하는 script-src, 나머지는 막고 그림 · 글꼴은 data: 만', () => {
  assert.equal(scriptHash(''), "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='")
  const policy = cspPolicy(['a()', 'b()'])
  const directives = Object.fromEntries(policy.split('; ').map((part) => [part.split(' ')[0], part.split(' ').slice(1)]))
  assert.deepEqual(directives['default-src'], ["'none'"])
  assert.deepEqual(directives['script-src'], [scriptHash('a()'), scriptHash('b()')])
  assert.deepEqual(directives['img-src'], ['data:'])
  assert.deepEqual(directives['font-src'], ['data:'])
  assert.deepEqual(directives['base-uri'], ["'none'"])
  assert.deepEqual(directives['form-action'], ["'none'"])
  assert.deepEqual(directives['style-src'], ["'unsafe-inline'"])
  assert.ok(!/unsafe-eval|script-src[^;]*unsafe-inline|file:|\*/.test(policy), policy)
  assert.throws(() => cspPolicy([]), /at least one script/)
  assert.equal(cspMeta(['a()']), `<meta http-equiv="Content-Security-Policy" content="${cspPolicy(['a()'])}">`)
})

test('조판 HTML: 정책이 첫 스크립트보다 앞, 해시 = 그 문서의 두 인라인 스크립트(문서마다 다르다)', () => {
  const seen = new Set()
  const cases = [
    [virtualSpec(), variantSettings('plain')],
    [{ ...virtualSpec(), title: '다른 제목' }, variantSettings('plain')],
    [virtualSpec(), variantSettings('options')],
    [virtualSpec(), variantSettings('landscape')],
  ]
  for (const [spec, settings] of cases) {
    const html = renderPrintHtml(spec, { settings })
    const policy = policyOf(html)
    assert.ok(policy && html.indexOf('Content-Security-Policy') < html.indexOf('<script>') && html.indexOf('Content-Security-Policy') < html.indexOf('</head>'))
    const scripts = scriptsOf(html)
    assert.equal(scripts.length, 2, '인라인 스크립트는 쪽 정보 · 쪽 나누기 두 개')
    assert.ok(scripts[0].startsWith('window.__PAGE_META__='))
    assert.equal(policy, cspPolicy(scripts))
    seen.add(policy)
  }
  assert.equal(seen.size, 4, '제목 · 조판 선택 사항이 다르면 해시도 다르다')
})

// 그림 svgText 는 허용 목록 검사(spec 모드가 한다)를 거치지 않은 채로 넣어, 정책과 여는 방식만으로 막히는지 본다.
const HOSTILE = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>window.__evil=1</script>',
  '<rect width="10" height="10" onload="window.__evil=2"/></svg>',
  '<img src="x" onerror="window.__evil=3">',
  '<iframe id="leak" src="file:///etc/hosts"></iframe>',
].join('')

async function probe(cdp, html) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const call = (method, params) => cdp.send(method, params, sessionId)
  try {
    await call('Runtime.enable')
    await openDocument(call, html, 45000)
    const evaluate = async (expression) => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value
    const until = Date.now() + 60000
    while ((await evaluate('window.__paged === true')) !== true) {
      if (Date.now() > until) throw new Error('typesetting did not finish')
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return JSON.parse(await evaluate(`(async () => {
      const fetched = await fetch('file:///etc/hosts').then(() => 'read', () => 'blocked');
      const frame = document.getElementById('leak');
      let frameUrl = 'none';
      try { frameUrl = frame && frame.contentDocument ? String(frame.contentDocument.URL) : 'no-access'; } catch { frameUrl = 'no-access'; }
      return JSON.stringify({ evil: window.__evil ?? null, err: window.__err || null, pages: window.__pageCount,
        limit: window.__typesetLimitMs, href: location.href, fetched, frameUrl });
    })()`))
  } finally {
    await cdp.send('Target.closeTarget', { targetId })
  }
}

test('헤드리스 브라우저: 조판은 끝나고, 그림에 섞인 스크립트 · 이벤트는 돌지 않으며 로컬 파일을 읽지 못한다', { skip: browserSkipReason(), timeout: 120000 }, async () => {
  const spec = { title: '정책', chapters: [{ no: '1', title: '장', sections: [{ no: '1.1', title: '절', blocks: [{ t: 'p', html: '문단' }, { t: 'figure', num: '1-1', svgText: HOSTILE, caption: '그림' }] }] }] }
  const html = renderPrintHtml(spec, { settings: variantSettings('plain') })
  let result
  let printed
  await withChrome(async (cdp) => {
    result = await probe(cdp, html)
    printed = await printPdf(cdp, html)
  })
  assert.equal(result.err, null)
  assert.ok(result.pages >= 2, `쪽 수 ${result.pages}`)
  assert.equal(result.evil, null, '그림의 스크립트 · 이벤트 속성이 돌지 않는다')
  assert.equal(result.limit, 45000, '문서를 넣기 전에 둔 시간 상한을 스크립트가 읽는다')
  assert.equal(result.href, 'about:blank')
  assert.equal(result.fetched, 'blocked')
  assert.notEqual(result.frameUrl.startsWith('file:'), true, `프레임이 로컬 파일을 싣지 않는다(${result.frameUrl})`)
  assert.equal(printed.pdf.subarray(0, 5).toString(), '%PDF-')
  assert.equal(printed.meta.pages, result.pages)
})
