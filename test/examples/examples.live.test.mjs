// 예제 원고 굽기 시험 — init 이 만드는 한국어 · 영어 예제와 표 · 그림이 많은 보고서 예제(examples/report)를 실제 브라우저로 PDF · 웹판까지 굽고, check 로 차례 · 책갈피 · 링크를 확인한다.
// 부르는 곳: npm test. 브라우저를 찾지 못하는 환경에서는 건너뛴다.
// 먼저 읽을 파일: examples/<언어>/docs/guide.md, src/cli/commands/init.mjs, src/check/index.mjs.
import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, test } from 'node:test'
import { build } from '../../src/build/index.mjs'
import { withChrome } from '../../src/browser/chrome.mjs'
import { openDocument } from '../../src/browser/print.mjs'
import { checkPdfs } from '../../src/check/index.mjs'
import { runCli } from '../../src/cli/main.mjs'
import { removeTree } from '../../src/platform.mjs'
import { browserSkipReason } from '../fixtures/browser.mjs'

const folders = []
after(() => Promise.all(folders.map((folder) => removeTree(folder))))

async function initExample(locale) {
  const dir = await mkdtemp(join(tmpdir(), `typeset-example-${locale}-`))
  folders.push(dir)
  const code = await runCli(['init', '--locale', locale], { out: () => {}, err: () => {}, cwd: dir, env: {} })
  assert.equal(code, 0)
  return dir
}

/** 웹판을 좁은 화면(폭 375px)으로 열어 가로 스크롤이 생기는지, 옆 차례가 숨고 접는 차례가 보이는지 잰다. */
async function measureNarrowWeb(cdp, html) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const call = (method, params) => cdp.send(method, params, sessionId)
  try {
    await call('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 1, mobile: true })
    await call('Runtime.enable')
    await openDocument(call, html, 0)
    const expression = `JSON.stringify({ scroll: document.documentElement.scrollWidth, side: getComputedStyle(document.querySelector('.wside')).display, mini: getComputedStyle(document.querySelector('.wtocmini')).display })`
    return JSON.parse((await call('Runtime.evaluate', { expression, returnByValue: true })).result.value)
  } finally {
    await cdp.send('Target.closeTarget', { targetId })
  }
}

describe('예제 원고', { skip: browserSkipReason(), timeout: 240000 }, () => {
  for (const locale of ['ko', 'en']) {
    test(`${locale}: PDF 가 넘친 쪽 없이 구워지고 check 를 통과하며(Type 3 글꼴 없음), 웹판은 좁은 화면에서 가로로 넘치지 않는다`, async () => {
      const dir = await initExample(locale)
      const result = await build({ cwd: dir, outputs: { pdf: true, printHtml: true, web: true } })
      const [report] = result.reports
      assert.deepEqual(report.problems, [])
      assert.deepEqual(report.overflow, [])
      assert.ok(report.bookmarks >= 10 && report.links >= 10, `bookmarks ${report.bookmarks}, links ${report.links}`)
      assert.equal(report.landscapePages, 0)
      const checked = await checkPdfs([join(dir, report.files.pdf)], { cwd: dir })
      assert.deepEqual(checked.results[0].problems, [])
      assert.equal(checked.results[0].facts.type3Fonts, 0)
      assert.equal(checked.results[0].facts.tocLines, report.bookmarks - 2, '차례 줄 = 장 · 절 책갈피(문서 정보 · 차례 책갈피 제외)')
      const web = await readFile(join(dir, report.files.web), 'utf8')
      const narrow = await withChrome((cdp) => measureNarrowWeb(cdp, web))
      assert.deepEqual(narrow, { scroll: 375, side: 'none', mini: 'block' })
    })
  }

  test('report: 표와 그림이 많은 보고서가 넘친 쪽 없이 구워진다. 열이 많은 표는 가로 쪽에 실리고, 긴 표는 여러 쪽에 이어 실린다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'typeset-example-report-'))
    folders.push(dir)
    await cp(fileURLToPath(new URL('../../examples/report', import.meta.url)), dir, { recursive: true })
    const [report] = (await build({ cwd: dir, outputs: { pdf: true, printHtml: true, web: true } })).reports
    assert.deepEqual(report.problems, [])
    assert.deepEqual(report.overflow, [])
    assert.equal(report.landscapePages, 1)
    assert.ok(report.pages >= 12, `pages ${report.pages}`)
    const checked = await checkPdfs([join(dir, report.files.pdf)], { cwd: dir, requireToc: true })
    assert.deepEqual(checked.results[0].problems, [])
    assert.equal(checked.results[0].facts.type3Fonts, 0)
    const printed = await readFile(join(dir, report.files.printHtml), 'utf8')
    assert.equal(printed.match(/<img src="data:image\/png;base64,/g)?.length, 1, 'PNG figure is embedded')
  })
})
