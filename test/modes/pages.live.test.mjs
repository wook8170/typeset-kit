// pages 모드 실제 굽기 시험 — 헤드리스 브라우저로 원고를 구워 PDF 를 만들고, check 로 다시 읽어 확인한다.
// 부르는 곳: npm test. 브라우저를 찾지 못하는 환경에서는 건너뛴다.
// 먼저 읽을 파일: src/modes/pages.mjs, src/build/index.mjs.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { after, before, describe, test } from 'node:test'
import { build } from '../../src/build/index.mjs'
import { findBrowser } from '../../src/browser/find.mjs'
import { checkPdfs } from '../../src/check/index.mjs'
import { inspectPdf } from '../../src/pdf/inspect.mjs'

function locateBrowser() {
  try {
    findBrowser()
    return false
  } catch (error) {
    return error.message.split('\n')[0]
  }
}

/** 압축이 되지 않는 무작위 RGB 그림(PNG). 굽은 PDF 가 상한을 넘게 만드는 데 쓴다. */
function noisePng(width, height) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(body))
    return Buffer.concat([head, body, tail])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const rows = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), randomBytes(width * 3)])))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 0 })), chunk('IEND', Buffer.alloc(0))])
}

const face = (title, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>@page{size:A4;margin:0}body{margin:40px;font-family:sans-serif}</style></head><body>${body}</body></html>`

let root
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'typeset-kit-pages-live-'))
  await mkdir(join(root, 'brochure'), { recursive: true })
  await mkdir(join(root, 'booklet'), { recursive: true })
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await writeFile(join(root, 'brochure/pixel.png'), pixel)
  await writeFile(join(root, 'brochure/01-cover.html'), face('Brochure 1.0 · Cover', '<h1>Cover {{VERSION}}</h1><img src="pixel.png" width="40" height="40">'))
  await writeFile(join(root, 'brochure/02-detail.html'), face('Brochure · Detail', '<h1>Detail</h1><p>Version {{VERSION}}</p>'))
  await writeFile(
    join(root, 'booklet/book.html'),
    face(
      'Booklet',
      '<a href="#second">to second</a><div role="heading" aria-level="1">Part one</div><div style="break-before:page" id="second" role="heading" aria-level="1">Part two</div><div role="heading" aria-level="2">Detail two</div>',
    ),
  )
  await writeFile(join(root, 'booklet/bad.html'), face('Bad', '<p>{{UNKNOWN}}</p>'))
  const documents = [
    { id: 'brochure', mode: 'pages', src: 'brochure/*.html', vars: { VERSION: '2.1.0' }, toc: true },
    { id: 'plain', mode: 'pages', src: ['brochure/02-detail.html'], vars: { VERSION: '3' } },
    { id: 'booklet', mode: 'pages', src: 'booklet/book.html' },
    { id: 'bad', mode: 'pages', src: 'booklet/bad.html' },
    { id: 'huge', mode: 'pages', src: 'booklet/book.html', out: 'huge' },
  ]
  await writeFile(join(root, 'typeset.config.json'), JSON.stringify({ documents }))
})
after(() => rm(root, { recursive: true, force: true }))

describe('pages 모드', { skip: locateBrowser() }, () => {
  test('면마다 구워 합치고, 차례 · 책갈피 · 쪽 번호 표기가 check 를 통과한다', async () => {
    const result = await build({ cwd: root, ids: ['brochure', 'plain'] })
    assert.equal(result.hasProblems, false, JSON.stringify(result.reports))
    const [brochure, plain] = result.reports
    assert.equal(brochure.files.pdf, 'typeset-out/brochure.pdf')
    assert.equal(brochure.files.printHtml, null, '면이 둘이면 인쇄판 HTML 은 없다')
    assert.equal(brochure.pages, 3)
    assert.equal(brochure.frontPages, 1)
    assert.equal(brochure.bookmarks, 3)
    assert.match(brochure.browser, /Chrome\/\d+/)
    assert.equal(plain.files.printHtml, 'typeset-out/plain.html')
    assert.ok((await readFile(join(root, 'typeset-out/plain.html'), 'utf8')).includes('Version 3'))
    const info = await inspectPdf(await readFile(join(root, 'typeset-out/brochure.pdf')))
    assert.deepEqual(info.outline.map((item) => [item.depth, item.title, item.page]), [[0, '차례', 0], [0, 'Brochure 1.0 · Cover', 1], [0, 'Brochure · Detail', 2]])
    assert.deepEqual(info.pageLabels, ['i', '1', '2'])
    const checked = await checkPdfs([join(root, 'typeset-out/brochure.pdf')], { cwd: root, maxMb: 90, allowType3: true })
    assert.deepEqual(checked.results[0].problems, [])
    assert.equal(checked.results[0].facts.tocLines, 2)
  })

  test('원고가 하나면 Chrome 이 쓴 책갈피 · 안쪽 링크를 그대로 둔다', async () => {
    const { reports } = await build({ cwd: root, ids: ['booklet'] })
    assert.deepEqual(reports[0].problems, [])
    const info = await inspectPdf(await readFile(join(root, 'typeset-out/booklet.pdf')))
    assert.deepEqual(info.outline.map((item) => [item.depth, item.title]), [[0, 'Part one'], [0, 'Part two'], [1, 'Detail two']])
    const inner = info.links.filter((link) => !link.external)
    assert.equal(inner.length, 1)
    assert.equal(inner[0].page, 1)
    assert.equal(info.pageMode, '/UseOutlines')
  })

  test('vars 에 없는 이름이 있으면 굽지 않고 missing-var 로 알린다', async () => {
    const { reports, hasProblems } = await build({ cwd: root, ids: ['bad'] })
    assert.equal(hasProblems, true)
    assert.match(reports[0].problems[0], /^missing-var: \{\{UNKNOWN\}\} in booklet\/bad\.html/)
    assert.equal(reports[0].files.pdf, null)
  })

  test('크기 상한을 넘으면 파일을 지우고 pdf-size 로 알린다', async () => {
    await writeFile(join(root, 'booklet/noise.png'), noisePng(1000, 1000))
    await writeFile(join(root, 'booklet/big.html'), face('Big', '<img src="noise.png" width="700">'))
    await writeFile(join(root, 'typeset.config.json'), JSON.stringify({ limits: { pdfMaxMb: 1 }, documents: [{ id: 'huge', mode: 'pages', src: 'booklet/big.html' }] }))
    const { reports, hasProblems } = await build({ cwd: root })
    assert.equal(hasProblems, true)
    assert.match(reports[0].problems[0], /^pdf-size: \d+\.\d MB is over the 1 MB limit/)
    assert.equal(reports[0].files.pdf, null)
    await assert.rejects(() => readFile(join(root, 'typeset-out/huge.pdf')), { code: 'ENOENT' })
  })
})
