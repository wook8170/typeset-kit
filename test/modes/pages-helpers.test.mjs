// pages 모드 도우미 시험 — 글롭 · 자리표시자 · 로컬 파일 넣기 · 책갈피 트리 · 차례 모양.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/modes/pages/*.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { inlineAssets } from '../../src/modes/pages/assets.mjs'
import { flattenTree, shiftTree, treeFromFaces, treeFromFlat } from '../../src/modes/pages/outline.mjs'
import { expandSources } from '../../src/modes/pages/sources.mjs'
import { fillVars, pageTitle, preparePage, READY_SCRIPT } from '../../src/modes/pages/template.mjs'
import { A4_HEIGHT_POINT, TOC_LAYOUT, tocHtml, tocLinks, tocPageCount } from '../../src/modes/pages/toc.mjs'

let dir
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'typeset-kit-pages-'))
  await mkdir(join(dir, 'a/deep'), { recursive: true })
  for (const file of ['a/02-b.html', 'a/01-a.html', 'a/notes.txt', 'a/deep/03-c.html', 'single.html']) await writeFile(join(dir, file), file)
})
after(() => rm(dir, { recursive: true, force: true }))

describe('expandSources', () => {
  test('글롭은 이름순이고 하위 폴더는 ** 일 때만 들어간다', async () => {
    const shallow = await expandSources('a/*.html', dir)
    assert.deepEqual(shallow.files.map((file) => file.slice(dir.length + 1)), ['a/01-a.html', 'a/02-b.html'])
    const deep = await expandSources('a/**/*.html', dir)
    assert.deepEqual(deep.files.map((file) => file.slice(dir.length + 1)), ['a/01-a.html', 'a/02-b.html', 'a/deep/03-c.html'])
  })

  test('경로 목록은 적은 순서를 지키고 같은 파일은 한 번만 싣는다', async () => {
    const { files } = await expandSources(['single.html', 'a/01-a.html', 'a/*.html'], dir)
    assert.deepEqual(files.map((file) => file.slice(dir.length + 1)), ['single.html', 'a/01-a.html', 'a/02-b.html'])
  })

  test('일치하는 파일이 없는 항목은 missing 으로 알린다', async () => {
    const { files, missing } = await expandSources(['none/*.html', 'nothing.html', 'single.html'], dir)
    assert.equal(files.length, 1)
    assert.deepEqual(missing, ['none/*.html', 'nothing.html'])
  })
})

describe('template', () => {
  test('{{이름}} 을 채우고 없는 이름은 그대로 두며 모아서 알린다', () => {
    const { html, missing } = fillVars('<p>{{A}} {{ B }} {{FACT:x-1}} {{A}} {{C}}</p>', { A: '1', B: '2', 'FACT:x-1': '9' })
    assert.equal(html, '<p>1 2 9 1 {{C}}</p>')
    assert.deepEqual(missing, ['C'])
  })

  test('쪽 제목은 엔티티를 풀고 공백을 하나로 모은다', () => {
    assert.equal(pageTitle('<head><title> A &amp; B \n 소개 </title></head>'), 'A & B 소개')
    assert.equal(pageTitle('<p>no title</p>'), '')
  })

  test('글꼴 CSS 는 head 끝, 준비 스크립트는 body 끝에 들어간다', () => {
    const html = preparePage('<html><head><title>t</title></head><body><p>x</p></body></html>', { fontCss: '@font-face{}' })
    assert.ok(html.includes('<style>@font-face{}</style></head>'))
    assert.ok(html.endsWith(`${READY_SCRIPT}</body></html>`))
    assert.ok(preparePage('<p>fragment</p>').endsWith(READY_SCRIPT))
  })
})

describe('inlineAssets', () => {
  test('그림 · 스타일시트 · CSS url() 을 문서 안으로 넣고, 못 찾은 것은 알린다', async () => {
    await writeFile(join(dir, 'pic.png'), Buffer.from([1, 2, 3]))
    await writeFile(join(dir, 'font.woff2'), Buffer.from([4, 5]))
    await writeFile(join(dir, 'site.css'), '@font-face{src:url("font.woff2")} body{background:url(pic.png)}')
    const source =
      '<link rel="stylesheet" href="site.css"><img src="pic.png"><img src="https://example.com/x.png"><img src="gone.png">' +
      '<div style="background:url(pic.png)"></div><a href="other.html">link</a><style>a{background:url(pic.png)}</style>'
    const { html, missing } = await inlineAssets(source, dir)
    assert.ok(!html.includes('site.css'))
    assert.ok(!html.includes('"pic.png"') && !html.includes('url(pic.png)'))
    assert.ok(html.includes('data:image/png;base64,AQID'))
    assert.ok(html.includes('data:font/woff2;base64,BAU='))
    assert.ok(html.includes('https://example.com/x.png'))
    assert.ok(html.includes('href="other.html"'))
    assert.deepEqual(missing, ['gone.png'])
  })
})

describe('outline', () => {
  const flat = [
    { depth: 0, title: '1장', page: 2 },
    { depth: 1, title: '1.1', page: 3 },
    { depth: 2, title: '너무 깊음', page: 3 },
    { depth: 0, title: '2장', page: 5 },
    { depth: 1, title: '끊긴 항목', page: -1 },
  ]

  test('목록을 트리로 묶고 깊이 상한과 목적지 없는 항목을 버린다', () => {
    assert.deepEqual(treeFromFlat(flat), [
      { title: '1장', pageIndex: 2, children: [{ title: '1.1', pageIndex: 3, children: [] }] },
      { title: '2장', pageIndex: 5, children: [] },
    ])
  })

  test('쪽 밀기 · 펼치기 · 면 트리', () => {
    const tree = treeFromFlat(flat)
    assert.deepEqual(shiftTree(tree, 2).map((node) => node.pageIndex), [4, 7])
    assert.deepEqual(flattenTree(tree).map((row) => `${row.depth}:${row.title}:${row.pageIndex}`), ['0:1장:2', '1:1.1:3', '0:2장:5'])
    assert.deepEqual(treeFromFaces(['가', '나'], [0, 4]), [
      { title: '가', pageIndex: 0, children: [] },
      { title: '나', pageIndex: 4, children: [] },
    ])
  })
})

describe('toc', () => {
  test('차례 쪽 수는 줄 28 개마다 한 쪽이다', () => {
    assert.deepEqual([0, 1, 28, 29, 56, 57].map(tocPageCount), [1, 1, 1, 2, 2, 3])
  })

  test('링크 영역은 줄 위치와 같고, 줄이 쪽을 넘으면 다음 쪽 맨 위에서 다시 시작한다', () => {
    const links = tocLinks(Array.from({ length: 30 }, (_, index) => index + 5))
    assert.deepEqual([links[0].pageIndex, links[27].pageIndex, links[28].pageIndex], [0, 0, 1])
    assert.deepEqual(links[0].rect, [54, A4_HEIGHT_POINT - (TOC_LAYOUT.firstRowTop + TOC_LAYOUT.rowHeight) * 0.75, 541.5, A4_HEIGHT_POINT - TOC_LAYOUT.firstRowTop * 0.75])
    assert.deepEqual(links[28].rect, links[0].rect)
    assert.equal(links[29].targetPageIndex, 34)
  })

  test('차례 HTML 은 제목을 이스케이프하고 면마다 한 쪽씩 둔다', () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({ depth: 0, title: index === 0 ? '<b>&' : `장 ${index}`, number: index + 1 }))
    const html = tocHtml(rows, { heading: '차례' })
    assert.ok(html.includes('&lt;b&gt;&amp;'))
    assert.equal(html.match(/class="sheet"/g).length, 2)
    assert.equal(html.match(/<h1>/g).length, 1)
    assert.ok(html.includes('window.__paged=true'))
  })
})
