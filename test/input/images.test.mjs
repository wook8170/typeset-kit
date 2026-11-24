// 그림 넣기 시험 — PNG 머리 · 배율 · 줄일 크기 판정, 파일을 data 주소로 바꾸기, inline SVG, 없는 파일 · 바깥 주소, 실제 브라우저로 줄이기.
// 부르는 곳: npm test. 줄이기 항목은 브라우저가 없으면 건너뛴다.
// 먼저 읽을 파일: src/input/images.mjs, src/input/png.mjs.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { after, describe, test } from 'node:test'
import { withChrome } from '../../src/browser/chrome.mjs'
import { classifyFigure, inlineSpecImages, needsInlining } from '../../src/input/images.mjs'
import { pngDensity, pngHeader, shrinkSize } from '../../src/input/png.mjs'
import { browserSkipReason } from '../fixtures/browser.mjs'

/** 한 가지 색으로 칠한 PNG. ppm 을 주면 pHYs 묶음(미터 단위)을 넣는다. */
function solidPng(width, height, ppm = null) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const size = Buffer.alloc(4)
    size.writeUInt32BE(data.length)
    const check = Buffer.alloc(4)
    check.writeUInt32BE(crc32(body))
    return Buffer.concat([size, body, check])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const physical = Buffer.alloc(9)
  if (ppm) {
    physical.writeUInt32BE(ppm, 0)
    physical.writeUInt32BE(ppm, 4)
    physical[8] = 1
  }
  const rows = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x7f)])))
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), ...(ppm ? [chunk('pHYs', physical)] : []),
    chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0)),
  ])
}

const root = mkdtempSync(join(tmpdir(), 'typeset-images-'))
after(() => rmSync(root, { recursive: true, force: true }))
mkdirSync(join(root, 'img'))
writeFileSync(join(root, 'img/small.png'), solidPng(40, 20))
writeFileSync(join(root, 'img/retina.png'), solidPng(400, 200, 5669))
writeFileSync(join(root, 'img/big.png'), solidPng(3000, 1000))
writeFileSync(join(root, 'img/photo.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
writeFileSync(join(root, 'img/diagram.svg'), '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="small.png" width="5" height="5"/></svg>')

const specWith = (...blocks) => ({ title: 't', chapters: [{ no: '1', title: 'c', sections: [{ no: '1.1', title: 's', blocks }] }] })
const blocksOf = (spec) => spec.chapters[0].sections[0].blocks

describe('PNG 판정', () => {
  test('머리에서 폭 · 높이 · pHYs 를 읽고, PNG 가 아니면 null', () => {
    assert.deepEqual(pngHeader(solidPng(30, 10, 5669)), { width: 30, height: 10, ppm: 5669 })
    assert.deepEqual(pngHeader(solidPng(30, 10)), { width: 30, height: 10, ppm: null })
    assert.equal(pngHeader(Buffer.from('not a png at all, really not')), null)
  })
  test('배율은 pHYs → 파일 이름 @Nx → 1', () => {
    assert.equal(pngDensity('a.png', { ppm: 5669 }), 2)
    assert.equal(pngDensity('a@3x.png', { ppm: null }), 3)
    assert.equal(pngDensity('a.png', { ppm: null }), 1)
  })
  test('긴 변이 상한을 넘을 때만 비율을 지켜 줄이고, 상한 0 은 끔', () => {
    assert.deepEqual(shrinkSize(3000, 1000, 2000), { width: 2000, height: 667 })
    assert.equal(shrinkSize(2000, 100, 2000), null)
    assert.equal(shrinkSize(5000, 100, 0), null)
  })
  test('넣을 그림 고르기와 판정', () => {
    assert.equal(needsInlining({ t: 'figure', src: 'a.png' }), true)
    assert.equal(needsInlining({ t: 'figure', src: 'data:image/png;base64,AA' }), false)
    assert.equal(needsInlining({ t: 'figure', src: 'a.svg', inline: true, svgText: '<svg/>' }), false)
    assert.equal(needsInlining({ t: 'p', html: 'x' }), false)
    assert.deepEqual(classifyFigure({ src: 'a.svg', inline: true }), { kind: 'svg', mime: 'image/svg+xml' })
    assert.deepEqual(classifyFigure({ src: 'a.svg' }), { kind: 'image', mime: 'image/svg+xml' })
    assert.match(classifyFigure({ src: 'https://example.com/a.png' }).problem, /^missing-file: .*remote/)
    assert.match(classifyFigure({ src: 'a.bmp' }).problem, /unsupported/)
  })
})

describe('그림 넣기', () => {
  test('파일을 data 주소로, 2배 캡처는 CSS 크기를 정하고, inline SVG 는 svgText 로(안의 그림도 data 주소로)', async () => {
    const spec = specWith(
      { t: 'figure', src: 'img/small.png', caption: 'a' },
      { t: 'figure', src: 'img/retina.png', caption: 'b' },
      { t: 'figure', src: 'img/photo.jpg', caption: 'c' },
      { t: 'figure', src: 'img/diagram.svg', caption: 'd', inline: true },
      { t: 'p', html: 'x' },
    )
    const { spec: result, problems } = await inlineSpecImages(spec, { root, limits: { imageMaxPx: 2000 } })
    assert.deepEqual(problems, [])
    const [small, retina, photo, diagram, paragraph] = blocksOf(result)
    assert.match(small.src, /^data:image\/png;base64,/)
    assert.equal(small.px, undefined, '1배 그림은 원래 크기 그대로')
    assert.deepEqual(retina.px, { w: 200, h: 100 })
    assert.match(photo.src, /^data:image\/jpeg;base64,/)
    assert.equal(diagram.src, undefined)
    assert.match(diagram.svgText, /^<svg [^>]*><image href="data:image\/png;base64,/)
    assert.deepEqual(paragraph, { t: 'p', html: 'x' })
    assert.equal(blocksOf(spec)[0].src, 'img/small.png', '받은 명세는 바꾸지 않는다')
  })
  test('없는 파일 · 바깥 주소 · SVG 안의 없는 그림은 문제로 알리고 나머지는 넣는다', async () => {
    writeFileSync(join(root, 'img/broken.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><image href="none.png"/></svg>')
    const spec = specWith(
      { t: 'figure', src: 'img/none.png', caption: 'a' },
      { t: 'figure', src: 'https://example.com/a.png', caption: 'b' },
      { t: 'figure', src: 'img/broken.svg', caption: 'c', inline: true },
      { t: 'figure', src: 'img/small.png', caption: 'd' },
    )
    const { spec: result, problems } = await inlineSpecImages(spec, { root, limits: { imageMaxPx: 2000 } })
    assert.deepEqual(problems.map((problem) => problem.split(' ')[0]), ['missing-file:', 'missing-file:', 'missing-file:'])
    assert.match(problems[2], /none\.png referenced by an SVG figure/)
    assert.match(blocksOf(result)[3].src, /^data:image\/png/)
  })
  test('브라우저가 없으면(cdp 없음) 큰 PNG 도 줄이지 않고 넣는다', async () => {
    const { spec: result } = await inlineSpecImages(specWith({ t: 'figure', src: 'img/big.png', caption: 'a' }), { root, limits: { imageMaxPx: 2000 } })
    const bytes = Buffer.from(blocksOf(result)[0].src.split(',')[1], 'base64')
    assert.equal(pngHeader(bytes).width, 3000)
  })
  test('실제 브라우저: 긴 변이 상한을 넘는 PNG 를 줄여 넣는다', { skip: browserSkipReason(), timeout: 60000 }, async () => {
    const spec = specWith({ t: 'figure', src: 'img/big.png', caption: 'a' }, { t: 'figure', src: 'img/small.png', caption: 'b' })
    const result = await withChrome((cdp) => inlineSpecImages(spec, { root, limits: { imageMaxPx: 2000 }, cdp }))
    assert.deepEqual(result.problems, [])
    const [big, small] = blocksOf(result.spec).map((block) => pngHeader(Buffer.from(block.src.split(',')[1], 'base64')))
    assert.deepEqual([big.width, big.height], [2000, 667])
    assert.deepEqual([small.width, small.height], [40, 20])
  })
})
