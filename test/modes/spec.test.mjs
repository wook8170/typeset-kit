// spec 모드 테스트 — 명세 파일 읽기 · 검사 · 인쇄판 HTML 쓰기 · PDF 굽기와 조판 보고, 판정 함수.
// 부르는 곳: npm test. 실제 브라우저 항목은 브라우저가 없으면 건너뛴다.
// 먼저 읽을 파일: src/modes/spec.mjs, docs/contract.md 「모드 모듈 계약」.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { withChrome } from '../../src/browser/chrome.mjs'
import {
  buildDocument, findSvgProblems, fontFamilies, judgePrinted, needsImageInlining, planPageLabels, SpecError,
} from '../../src/modes/spec.mjs'
import { browserSkipReason } from '../fixtures/browser.mjs'
import { variantSettings, virtualSpec } from '../fixtures/virtual-book.mjs'

const BUILTIN = { 'noto-sans-kr': { family: 'Noto Sans KR', files: [] }, 'jetbrains-mono': { family: 'JetBrains Mono', files: [] } }
const stubDeps = (extra = {}) => ({
  fontCss: async () => '/* fonts */',
  builtinFonts: async () => BUILTIN,
  applyPdfNavBytes: async (bytes) => ({ bytes, pages: null }),
  inspectPdf: async () => ({ outline: [{ depth: 0, title: 'a', page: 1 }], links: [{ external: false }, { external: true }], landscapePages: 0 }),
  ...extra,
})

const scratch = mkdtempSync(join(tmpdir(), 'typeset-spec-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

/** 임시 프로젝트 폴더 하나. 명세를 .json 으로 쓰고 job 을 만든다. */
function project(name, { spec = virtualSpec(), settings = variantSettings('plain'), outputs = { pdf: false, printHtml: true, web: false }, session = null } = {}) {
  const root = join(scratch, name)
  const outDir = join(root, 'out')
  mkdirSync(outDir, { recursive: true })
  if (spec) writeFileSync(join(root, 'guide.json'), JSON.stringify(spec))
  const document = { id: 'guide', mode: 'spec', src: 'guide.json', out: '', title: '' }
  return { document, settings, root, outDir, outputs, allowOverflow: false, session }
}

/** 조판이 곧바로 끝난 것처럼 답하는 CDP. pdf 는 IO.read 가 돌려줄 바이트다. */
function fakeCdp({ pdf = Buffer.from('%PDF-1.7 fake'), meta = { pages: 5, front: 2, anchors: {}, err: null, overflow: [] } } = {}) {
  const answers = {
    'Target.createTarget': () => ({ targetId: 't1' }),
    'Target.attachToTarget': () => ({ sessionId: 's1' }),
    'Page.printToPDF': () => ({ stream: 'st' }),
    'IO.read': () => ({ data: pdf.toString('base64'), base64Encoded: true, eof: true }),
    'Browser.getVersion': () => ({ product: 'HeadlessChrome/150.0.0.0' }),
    'Runtime.evaluate': (params) => {
      if (params.expression.includes('__paged === true')) return { result: { value: 'done' } }
      if (params.expression.startsWith('JSON.stringify')) return { result: { value: JSON.stringify(meta) } }
      return { result: {} }
    },
  }
  return { send: async (method, params = {}) => (answers[method] ?? (() => ({})))(params) }
}

describe('판정', () => {
  test('쪽 번호 표기: 표지 낱말 · 앞붙임 로마 숫자 · 본문 1 부터, 앞붙임이 없으면 로마 숫자 구간이 없다', () => {
    assert.deepEqual(planPageLabels(2, '표지'), [{ start: 0, prefix: '표지' }, { start: 1, style: 'r' }, { start: 3, style: 'D' }])
    assert.deepEqual(planPageLabels(0, 'Cover'), [{ start: 0, prefix: 'Cover' }, { start: 1, style: 'D' }])
  })
  test('넘친 쪽은 allowOverflow 가 아니면 문제, 크기 상한은 0 이면 없다', () => {
    assert.deepEqual(judgePrinted({ overflow: [3, 9], allowOverflow: false, bytes: 10, pdfMaxMb: 90 }), ['overflow: pages 3, 9'])
    assert.deepEqual(judgePrinted({ overflow: [3], allowOverflow: true, bytes: 10, pdfMaxMb: 90 }), [])
    assert.deepEqual(judgePrinted({ overflow: [], allowOverflow: false, bytes: 2 * 1024 * 1024, pdfMaxMb: 1 }), ['pdf-size: 2.0 MB exceeds 1 MB'])
    assert.deepEqual(judgePrinted({ overflow: [], allowOverflow: false, bytes: 1e12, pdfMaxMb: 0 }), [])
  })
  test('그림 넣기 단계는 data 주소가 아닌 그림이나 svgText 없는 inline 그림이 있을 때만', () => {
    const withBlock = (block) => ({ chapters: [{ sections: [{ blocks: [block] }] }] })
    assert.equal(needsImageInlining(withBlock({ t: 'figure', src: 'data:image/png;base64,AA' })), false)
    assert.equal(needsImageInlining(withBlock({ t: 'figure', svgText: '<svg/>', inline: true })), false)
    assert.equal(needsImageInlining(withBlock({ t: 'figure', src: 'img/a.png' })), true)
    assert.equal(needsImageInlining(withBlock({ t: 'figure', src: 'img/a.svg', inline: true })), true)
  })
  test('SVG 위반은 위치와 함께 알리고, 표지 마크도 검사한다', () => {
    const spec = virtualSpec()
    spec.chapters[0].sections[1].blocks.push({ t: 'figure', svgText: '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', caption: 'x' })
    const problems = findSvgProblems(spec, '<svg xmlns="http://www.w3.org/2000/svg" onload="x"></svg>')
    assert.equal(problems.length, 2)
    assert.match(problems[0], /^svg-guard: chapters\.0\.sections\.1\.blocks\.7: element not in the allow list "script"/)
    assert.match(problems[1], /^svg-guard: brand\.logo: <svg>: attribute not in the allow list "onload"/)
  })
  test('글꼴 이름: builtin 은 내장 글꼴 표에서, 파일 지정은 family 에서', () => {
    assert.deepEqual(fontFamilies({ sans: 'builtin:noto-sans-kr', mono: { family: 'Fira Code', files: [] } }, BUILTIN), { sans: 'Noto Sans KR', mono: 'Fira Code' })
    assert.throws(() => fontFamilies({ sans: 'builtin:nope', mono: 'builtin:jetbrains-mono' }, BUILTIN), /Unknown builtin font: builtin:nope/)
  })
})

describe('굽기', () => {
  test('인쇄판 HTML 만 낼 때: 파일을 쓰고, 경로는 root 기준 / 경로, 재지 않은 수는 null', async () => {
    const job = project('html-only')
    const report = await buildDocument(job, stubDeps())
    assert.deepEqual(report.files, { pdf: null, printHtml: 'out/guide.html', web: null })
    assert.deepEqual(report.problems, [])
    assert.equal(report.pages, null)
    const html = readFileSync(join(job.root, 'out/guide.html'), 'utf8')
    assert.ok(html.startsWith('<!doctype html>') && html.includes('<style>/* fonts */</style>'))
    assert.ok(html.includes("font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif"))
  })
  test('명세 파일이 없으면 missing-file, 로고 파일이 없어도 missing-file', async () => {
    assert.deepEqual((await buildDocument(project('no-spec', { spec: null }), stubDeps())).problems, ['missing-file: guide.json'])
    const settings = { ...variantSettings('plain'), brand: { ...variantSettings('plain').brand, logo: 'assets/mark.svg' } }
    assert.deepEqual((await buildDocument(project('no-logo', { settings }), stubDeps())).problems, ['missing-file: assets/mark.svg'])
  })
  test('로고 SVG 는 xml 선언을 떼고 표지에 넣는다', async () => {
    const settings = { ...variantSettings('plain'), brand: { ...variantSettings('plain').brand, logo: 'mark.svg' } }
    const job = project('logo', { settings })
    writeFileSync(join(job.root, 'mark.svg'), '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n')
    await buildDocument(job, stubDeps())
    assert.ok(readFileSync(join(job.root, 'out/guide.html'), 'utf8').includes('<div class="cvmark"><svg width="100%" height="100%" xmlns='))
  })
  test('SVG 위반이 있으면 아무 파일도 쓰지 않고 svg-guard 문제로 보고한다', async () => {
    const spec = virtualSpec()
    spec.chapters[0].sections[0].blocks.push({ t: 'figure', svgText: '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>', caption: 'x' })
    const job = project('svg-bad', { spec })
    const report = await buildDocument(job, stubDeps())
    assert.equal(report.problems.length, 1)
    assert.match(report.problems[0], /^svg-guard: /)
    assert.ok(!existsSync(join(job.root, 'out/guide.html')))
  })
  test('명세가 계약에 맞지 않으면 SpecError 로 문제를 모두 알린다', async () => {
    const spec = { title: 'x', chapters: [{ no: '1', title: '장', sections: [{ no: '1.1', title: '절', blocks: [{ t: 'callout', kind: 'tip', html: 'x' }, { t: 'p' }] }] }] }
    await assert.rejects(() => buildDocument(project('spec-bad', { spec }), stubDeps()), (error) => error instanceof SpecError && error.problems.length === 2)
  })
  test('설정으로 더한 콜아웃 종류는 검사를 지나고, .mjs 명세도 읽는다', async () => {
    const settings = variantSettings('plain', { theme: { callouts: { tip: 'oklch(0.5 0.1 150)' } } })
    const job = project('mjs', { spec: null, settings })
    writeFileSync(join(job.root, 'guide.mjs'), `export default ${JSON.stringify({ title: 'm', chapters: [{ no: '1', title: '장', sections: [{ no: '1.1', title: '절', blocks: [{ t: 'callout', kind: 'tip', html: 'x' }] }] }] })}\n`)
    const report = await buildDocument({ ...job, document: { ...job.document, src: 'guide.mjs' } }, stubDeps())
    assert.deepEqual(report.problems, [])
  })
  test('그림 넣기와 웹판은 다른 단계에 맡긴다', async () => {
    const spec = virtualSpec()
    spec.chapters[0].sections[0].blocks.push({ t: 'figure', src: 'img/a.png', caption: '캡처' })
    const calls = []
    const deps = stubDeps({
      inlineImages: async (input, options) => {
        calls.push(['images', options.limits.imageMaxPx])
        const spec = { ...input, chapters: input.chapters.map((chapter) => ({ ...chapter, sections: chapter.sections.map((section) => ({ ...section, blocks: section.blocks.map((block) => (block.src === 'img/a.png' ? { ...block, src: 'data:image/png;base64,AA' } : block)) })) })) }
        return { spec, problems: [] }
      },
      renderWeb: async (input, options) => (calls.push(['web', options.settings.locale]), '<!doctype html><title>web</title>'),
    })
    const job = project('delegate', { spec, outputs: { pdf: false, printHtml: false, web: true } })
    const report = await buildDocument(job, deps)
    assert.deepEqual(calls, [['images', 2000], ['web', 'ko']])
    assert.deepEqual(report.files, { pdf: null, printHtml: null, web: 'out/guide.web.html' })
  })
  test('PDF: 쪽 번호 표기 · 객체 스트림 저장을 맡기고, 쪽 수 · 앞붙임 · 크기 · 브라우저를 보고한다', async () => {
    const navCalls = []
    const deps = stubDeps({ applyPdfNavBytes: async (bytes, options) => (navCalls.push(options), { bytes, pages: 5 }) })
    const job = project('pdf', { outputs: { pdf: true, printHtml: false, web: false }, session: { cdp: fakeCdp(), timeoutMs: 0 } })
    const report = await buildDocument(job, deps)
    assert.deepEqual(navCalls, [{ pageLabels: planPageLabels(2, '표지'), objectStreams: true }])
    assert.equal(report.files.pdf, 'out/guide.pdf')
    assert.equal(readFileSync(join(job.root, 'out/guide.pdf'), 'latin1'), '%PDF-1.7 fake')
    assert.deepEqual([report.pages, report.frontPages, report.bytes, report.browser], [5, 2, 13, 'HeadlessChrome/150.0.0.0'])
    assert.deepEqual([report.landscapePages, report.bookmarks, report.links], [0, 1, 1], '가로 쪽 · 책갈피 · 내부 링크는 구운 PDF 를 읽어 센다')
    assert.deepEqual(report.problems, [])
  })
  test('그림 넣기 단계가 알린 문제는 굽지 않고 보고에 담는다', async () => {
    const spec = virtualSpec()
    spec.chapters[0].sections[0].blocks.push({ t: 'figure', src: 'img/none.png', caption: '없는 그림' })
    const deps = stubDeps({ inlineImages: async (input) => ({ spec: input, problems: ['missing-file: img/none.png'] }) })
    const report = await buildDocument(project('image-missing', { spec }), deps)
    assert.deepEqual(report.problems, ['missing-file: img/none.png'])
    assert.equal(report.files.printHtml, null)
  })
  test('PDF: 넘친 쪽은 문제로, 크기 상한을 넘으면 파일을 지우고 문제로', async () => {
    const overflowJob = project('overflow', { outputs: { pdf: true, printHtml: false, web: false }, session: { cdp: fakeCdp({ meta: { pages: 3, front: 1, anchors: {}, err: null, overflow: ['2'] } }), timeoutMs: 0 } })
    assert.deepEqual((await buildDocument(overflowJob, stubDeps())).problems, ['overflow: pages 2'])
    const settings = { ...variantSettings('plain'), limits: { imageMaxPx: 2000, pdfMaxMb: 1 } }
    const bigJob = project('too-big', { settings, outputs: { pdf: true, printHtml: false, web: false }, session: { cdp: fakeCdp({ pdf: Buffer.alloc(2 * 1024 * 1024) }), timeoutMs: 0 } })
    writeFileSync(join(bigJob.outDir, 'guide.pdf'), 'old')
    const report = await buildDocument(bigJob, stubDeps())
    assert.deepEqual(report.problems, ['pdf-size: 2.0 MB exceeds 1 MB'])
    assert.equal(report.files.pdf, null)
    assert.ok(!existsSync(join(bigJob.outDir, 'guide.pdf')), '지난 파일도 지운다')
  })
  test('실제 브라우저로 굽기: 쪽 수 · 앞붙임 · 넘친 쪽 없음', { skip: browserSkipReason(), timeout: 120000 }, async () => {
    let report
    await withChrome(async (cdp) => {
      const job = project('live', { outputs: { pdf: true, printHtml: true, web: false }, session: { cdp, timeoutMs: 0 } })
      report = await buildDocument(job, stubDeps())
    })
    assert.deepEqual(report.problems, [])
    assert.ok(report.pages > 10 && report.frontPages >= 2, `${report.pages} pages, ${report.frontPages} front`)
    assert.ok(report.bytes > 1000 && /Chrome/.test(report.browser))
  })
})
