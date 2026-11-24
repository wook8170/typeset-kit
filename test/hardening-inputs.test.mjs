// 입력 방어 시험 — 원고 · 설정 · 깨진 PDF · 끊긴 브라우저 연결이 「문제 없음」으로 지나가지 않는지 본다.
// 부르는 곳: npm test. 브라우저가 필요 없다(브라우저 연결은 가짜 웹소켓으로 흉내 낸다).
// 먼저 읽을 파일: src/modes/spec.mjs(findImageProblems), src/browser/cdp.mjs, src/render/svg-guard.mjs, src/pdf/inspect.mjs.
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { existsSync, mkdirSync } from 'node:fs'
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { build, outputExtensions } from '../src/build/index.mjs'
import { describeError } from '../src/cli/main.mjs'
import { checkWriting, WritingCheckError } from '../src/writing/index.mjs'
import { contentColWidths } from '../src/render/table-widths.mjs'
import { CdpError, connectCdp } from '../src/browser/cdp.mjs'
import { checkToc } from '../src/check/rules.mjs'
import { ConfigError, loadConfig } from '../src/config/load.mjs'
import { validateConfig } from '../src/config/validate.mjs'
import { markdownToSpec } from '../src/input/markdown.mjs'
import { findImageProblems } from '../src/modes/spec.mjs'
import { inspectPdf } from '../src/pdf/inspect.mjs'
import { removeTree } from '../src/platform.mjs'
import { renderPrintHtml } from '../src/render/index.mjs'
import { svgProblem } from '../src/render/svg-guard.mjs'
import { assignAnchors, validateSpec } from '../src/spec/contract.mjs'
import { hasCountCells } from '../src/writing/baseline.mjs'
import { extractHtml, extractMarkdown } from '../src/writing/extract.mjs'
import { selectRules } from '../src/writing/rules.mjs'
import { scanLines } from '../src/writing/scan.mjs'
import { variantSettings } from './fixtures/virtual-book.mjs'

const base = mkdtempSync(join(tmpdir(), 'typeset-kit-test-'))
after(() => removeTree(base))

describe('Markdown 에서 온 값이 속성 밖으로 나가지 못한다', () => {
  const ATTACK_IMAGE = '![cap](data:,x"><meta/http-equiv=refresh/content=0;url=//evil.example><b/x=")'
  const specOf = (body) => assignAnchors(markdownToSpec(`# t\n\n## A" hidden="1" onclick="alert(1)\n\n### s\n\n${body}\n`))
  test('그림 data 주소가 아닌 data: 주소는 bad-image 문제다', () => {
    assert.match(findImageProblems(specOf(ATTACK_IMAGE))[0], /^bad-image: chapters\.0\.sections\.0\.blocks\.0/)
    assert.deepEqual(findImageProblems(specOf('![ok](data:image/png;base64,AAAA)')), [])
  })
  test('렌더는 그림 주소 · 대체 글 · 장 제목의 따옴표를 바꿔 넣는다', () => {
    const html = renderPrintHtml(specOf(ATTACK_IMAGE), { settings: variantSettings('plain') })
    assert.ok(!html.includes('<meta/http-equiv=refresh'))
    assert.ok(!html.includes('data-chapterhead="1. A" hidden'))
    assert.ok(html.includes('data-chapterhead="1. A&quot; hidden=&quot;1&quot; onclick=&quot;alert(1)"'))
  })
})

describe('책 명세', () => {
  test('장이 하나도 없으면 문제다', () => {
    assert.deepEqual(validateSpec({ title: 't', chapters: [] }), [{ path: 'chapters', code: 'empty' }])
  })
})

describe('SVG 가드의 공백', () => {
  const NBSP = ' '
  test('HTML 이 공백으로 보지 않는 글자로 띄운 속성은 실패다', () => {
    assert.notEqual(svgProblem(`<svg xmlns="http://www.w3.org/2000/svg" aria-label${NBSP}=${NBSP}" onload=alert(1) "></svg>`), null)
    assert.notEqual(svgProblem('<svg xmlns="http://www.w3.org/2000/svg" aria-label\v=\v" onload=alert(1) "></svg>'), null)
    assert.notEqual(svgProblem(`<svg xmlns="http://www.w3.org/2000/svg"${NBSP}width="1"></svg>`), null)
  })
  test('스페이스 · 탭 · 줄바꿈으로 띄운 속성과 글 안의 NBSP 는 받는다', () => {
    assert.equal(svgProblem(`<svg xmlns="http://www.w3.org/2000/svg"\n\twidth = "1"><text x="1">a${NBSP}b</text></svg>`), null)
  })
})

describe('설정', () => {
  test('기본 내보내기가 없는 .mjs 설정은 오류다', async () => {
    const file = join(base, 'named-only.config.mjs')
    writeFileSync(file, 'export const config = { documents: [] }\n')
    await assert.rejects(() => loadConfig({ cwd: base, file }), (error) => error instanceof ConfigError && error.problems[0].code === 'missing-default-export')
  })
  test('값이 없는 설정은 기본값만으로 통과하지 않는다', () => {
    assert.ok(validateConfig(undefined).problems.length > 0)
  })
  test('Date · Map 은 묶음 자리에 올 수 없다', () => {
    const codes = (raw) => validateConfig(raw).problems.map((problem) => `${problem.code} ${problem.path}`)
    assert.deepEqual(codes({ documents: [], brand: new Date(0) }), ['wrong-type brand'])
    assert.deepEqual(codes({ documents: [], theme: { callouts: new Map() } }), ['wrong-type theme.callouts'])
  })
  test('문서가 하나도 없으면 build 는 설정 오류로 끝난다', async () => {
    const file = join(base, 'empty.config.json')
    writeFileSync(file, '{ "documents": [] }')
    await assert.rejects(() => build({ cwd: base, configFile: file }), (error) => error instanceof ConfigError && error.problems[0].code === 'no-documents')
  })
})

describe('글쓰기 기준선', () => {
  test('칸 값이 0 이상의 정수가 아니면 기준선으로 받지 않는다', () => {
    assert.equal(hasCountCells({ hype: { 'a.md': 2 } }), true)
    for (const rules of [{ hype: { 'a.md': 'x' } }, { hype: { 'a.md': -1 } }, { hype: 3 }, null, []]) assert.equal(hasCountCells(rules), false, JSON.stringify(rules))
  })
})

describe('PDF 검사', () => {
  test('책갈피가 자기 자신으로 이어져도 읽기가 끝난다', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const itemRef = doc.context.nextRef()
    const rootRef = doc.context.nextRef()
    doc.context.assign(itemRef, doc.context.obj({ Title: PDFString.of('loop'), Parent: rootRef, Next: itemRef, First: itemRef }))
    doc.context.assign(rootRef, doc.context.obj({ Type: 'Outlines', First: itemRef, Last: itemRef, Count: 1 }))
    doc.catalog.set(PDFName.of('Outlines'), rootRef)
    const info = await inspectPdf(Buffer.from(await doc.save()))
    assert.deepEqual(info.outline.map((item) => item.title), ['loop'])
  })
  test('requireToc 를 주면 차례가 없는 것이 문제다', () => {
    assert.deepEqual(checkToc(null), [])
    assert.match(checkToc(null, { requireToc: true })[0], /^toc-missing: /)
  })
})

describe('브라우저 연결', () => {
  /** 가짜 웹소켓. 보낸 명령을 기록하고, 테스트가 답 · 이벤트 · 끊김을 직접 일으킨다. */
  class FakeSocket {
    static last = null
    sent = []
    constructor() {
      FakeSocket.last = this
      queueMicrotask(() => this.onopen())
    }
    send(text) {
      this.sent.push(JSON.parse(text))
    }
    receive(message) {
      this.onmessage({ data: JSON.stringify(message) })
    }
    close() {
      this.onclose()
    }
  }
  const realWebSocket = globalThis.WebSocket
  const connect = async (options) => {
    globalThis.WebSocket = FakeSocket
    try {
      return { cdp: await connectCdp('ws://fake', options), socket: FakeSocket.last }
    } finally {
      globalThis.WebSocket = realWebSocket
    }
  }
  const isCdpError = (pattern) => (error) => error instanceof CdpError && pattern.test(error.message)

  test('연결이 끊기면 기다리던 명령이 실패하고, 끊긴 뒤에 보낸 명령은 바로 실패한다', async () => {
    const { cdp, socket } = await connect()
    const waiting = cdp.send('Page.printToPDF')
    socket.close()
    await assert.rejects(waiting, isCdpError(/connection closed/))
    await assert.rejects(cdp.send('Target.closeTarget'), isCdpError(/closed before Target\.closeTarget/))
  })
  test('답이 상한 안에 오지 않으면 실패한다', async () => {
    const { cdp } = await connect({ timeoutMs: 20 })
    await assert.rejects(cdp.send('Runtime.evaluate'), isCdpError(/Runtime\.evaluate did not answer/))
  })
  test('탭이 죽으면 그 탭에 보낸 명령만 실패한다', async () => {
    const { cdp, socket } = await connect()
    const onDeadTab = cdp.send('Page.printToPDF', {}, 'session-1')
    const onOtherTab = cdp.send('Runtime.evaluate', {}, 'session-2')
    socket.receive({ method: 'Inspector.targetCrashed', sessionId: 'session-1' })
    await assert.rejects(onDeadTab, isCdpError(/tab crashed/))
    socket.receive({ id: socket.sent[1].id, result: { ok: true } })
    assert.deepEqual(await onOtherTab, { ok: true })
  })
})

describe('2차 검증에서 나온 꼴', () => {
  test('점 · 공백 · .web 으로 끝나는 출력 이름과 장치 이름은 설정 오류다', () => {
    const codes = (out) => validateConfig({ documents: [{ id: 'a', mode: 'book', src: 'a.md', out }] }).problems.map((problem) => problem.code)
    for (const out of ['x.web', 'a.', 'a ', 'CON', 'nul.txt']) assert.deepEqual(codes(out), ['no-match'], out)
    for (const out of ['website', 'a.b', 'console']) assert.deepEqual(codes(out), [], out)
  })
  test('굽기를 시작하면 고른 문서의 지난 산출물을 지운다. 원고가 없어 실패해도 지난 파일이 남지 않는다', async () => {
    const root = join(base, 'stale')
    mkdirSync(join(root, 'typeset-out'), { recursive: true })
    writeFileSync(join(root, 'typeset.config.json'), JSON.stringify({ documents: [{ id: 'a', mode: 'book', src: 'gone.md' }] }))
    writeFileSync(join(root, 'typeset-out', 'a.html'), 'old')
    writeFileSync(join(root, 'typeset-out', 'a.pdf'), 'old pdf, kept: this run does not make a PDF')
    const result = await build({ cwd: root, outputs: { pdf: false, printHtml: true, web: false } })
    assert.equal(result.hasProblems, true)
    assert.equal(existsSync(join(root, 'typeset-out', 'a.html')), false)
    assert.equal(existsSync(join(root, 'typeset-out', 'a.pdf')), true)
    assert.deepEqual(outputExtensions({ pdf: true, printHtml: true, web: true }), ['.pdf', '.html', '.web.html'])
  })
  test('볼 파일이 없는 글쓰기 검사는 통과가 아니라 오류다. 명령은 스택 없이 문구만 보인다', async () => {
    const { config } = validateConfig({ documents: [] })
    const run = () => checkWriting({ root: base, config, mode: 'check' })
    await assert.rejects(run, (error) => error instanceof WritingCheckError)
    const shown = describeError(await run().catch((error) => error), {})
    assert.deepEqual(shown, { code: 1, text: 'Writing check: no files to check (add documents or writing.globs)' })
  })
  test('로마 숫자 쪽 번호의 시작 값이 아주 커도 읽기가 끝난다', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.catalog.set(PDFName.of('PageLabels'), doc.context.obj({ Nums: [0, { S: 'r', St: 300000000000 }] }))
    const info = await inspectPdf(Buffer.from(await doc.save()))
    assert.deepEqual(info.pageLabels, ['300000000000'])
  })
  test('행이 아주 많은 표도 열 폭을 잰다', () => {
    const rows = Array.from({ length: 200000 }, (_, index) => [`r${index}`, 'x'])
    assert.equal(contentColWidths(['a', 'b'], rows).length, 2)
  })
})

describe('3차 검증에서 나온 꼴', () => {
  const rules = selectRules(validateConfig({ documents: [{ id: 'a', mode: 'book', src: 'a.md' }] }).config.writing)
  const scanMarkdown = (source) => scanLines(extractMarkdown(source), rules).map((found) => [found.line, found.text])
  test('금지 표현이 문단 · 목록 항목 · 인용문의 줄 경계에 걸쳐도 찾고, 표현이 시작한 줄을 알린다', () => {
    assert.deepEqual(scanMarkdown('# t\n\n이 제품은 게임\n체인저다.\n'), [[3, '게임 체인저']])
    assert.deepEqual(scanMarkdown('- 항목은 게임\n  체인저다.\n'), [[1, '게임 체인저']])
    assert.deepEqual(scanMarkdown('> 첫 줄\n> 둘째 줄은 게임\n> 체인저다.\n'), [[2, '게임 체인저']])
  })
  test('강조 표시나 태그가 표현 가운데에 끼어도 찾는다', () => {
    assert.deepEqual(scanMarkdown('게임 **체인저** 다.\n'), [[1, '게임 체인저']])
    assert.deepEqual(scanLines(extractHtml('<p>게임 <b>체인저</b>\n다</p>'), rules).map((found) => found.text), ['게임 체인저'])
  })
  test('영어 규칙만 켠 문서에서는 한글 문단 안의 한글 없는 줄만 영어 규칙으로 본다', () => {
    const english = selectRules({ ...validateConfig({ documents: [] }).config.writing, languages: ['en'] })
    const found = scanLines(extractMarkdown('A robust tool.\n한글 줄은 robust 를 그대로 둔다.\n'), english).map((item) => [item.line, item.text])
    assert.deepEqual(found, [[1, 'robust']])
  })
  test('인용문이 목록으로 시작해도 내용이 콜아웃에 남는다. 목록 항목 안의 주석은 싣지 않는다', () => {
    const blocks = (source) => markdownToSpec(`# t\n\n## c\n\n### s\n\n${source}\n`).chapters[0].sections[0].blocks
    assert.deepEqual(blocks('> - 첫 항목\n> - 둘째 항목'), [{ t: 'callout', kind: 'note', html: '<ul><li>첫 항목</li><li>둘째 항목</li></ul>' }])
    assert.deepEqual(blocks('- 항목\n\n  <!-- 작성자 메모 -->\n\n  이어지는 글'), [{ t: 'ul', items: ['항목 이어지는 글'] }])
  })
  test('출력 폴더가 원고 폴더와 같아도 굽기 전 정리가 원고를 지우지 않는다', async () => {
    const root = join(base, 'same-dir')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'typeset.config.json'), JSON.stringify({ outDir: '.', documents: [{ id: 'a', mode: 'pages', src: 'a.html' }] }))
    writeFileSync(join(root, 'a.html'), '<p>{{missing}}</p>')
    const result = await build({ cwd: root, outputs: { pdf: false, printHtml: true, web: false } })
    assert.match(result.reports[0].problems[0], /^missing-var: /)
    assert.equal(existsSync(join(root, 'a.html')), true)
  })
})

describe('4차 검증에서 나온 꼴', () => {
  const ALLOWED_TAG = /<\/?(?:strong|em|code|del|br|a|ul|ol|li|pre)(?: [a-z]+="[^"<>]*")*>/g
  const htmlOf = (source) => JSON.stringify(markdownToSpec(`# t\n\n## c\n\n### s\n\n${source}\n`).chapters[0].sections[0].blocks)
  const cases = {
    'kbd 안': '단축키는 <kbd><img/src=x/onerror=alert(1)></kbd> 이다.',
    'code 태그 안': '<code><style/x>body{display:none}</style></code> 뒤',
    'pre 태그 안(인라인)': '앞 <pre><meta/http-equiv=refresh content=0></pre> 뒤',
    'script 태그 안': '앞 <script><b/onclick=alert(2)>x</script> 뒤',
    '목록 항목': '- <kbd><img/src=x/onerror=alert(1)></kbd>',
    '표 칸': '| a |\n|---|\n| <kbd><img/src=x></kbd> |',
    '콜아웃': '> <kbd><img/src=x></kbd>',
  }
  for (const [name, source] of Object.entries(cases)) {
    test(`작성자가 쓴 HTML 은 글자로 실린다: ${name}`, () => {
      const rest = htmlOf(source).replace(ALLOWED_TAG, '')
      assert.ok(!rest.includes('<'), rest)
    })
  }
  test('보통 글의 이스케이프는 그대로다(이미 적힌 문자 참조를 다시 바꾸지 않는다)', () => {
    assert.match(htmlOf('a &amp; b < c "d" &copy;'), /a &amp; b &lt; c &quot;d&quot; &copy;/)
  })
  test('쪽 HTML: 이웃한 칸 · 항목의 글은 잇지 않고, 글 속의 맨 < 는 태그로 보지 않는다', () => {
    const rules = selectRules(validateConfig({ documents: [{ id: 'a', mode: 'pages', src: 'a.html' }] }).config.writing)
    const found = (html) => scanLines(extractHtml(html), rules).map((item) => item.text)
    assert.deepEqual(found('<tr><th>검토</th><th>결과</th></tr>'), [])
    assert.deepEqual(found('<ul>\n<li>게임</li>\n<li>체인저</li>\n</ul>'), [])
    assert.deepEqual(found('<p>p < 0.05 인 경우다.\n이 제품은 게임\n체인저다.</p>'), ['게임 체인저'])
  })
})

