// checkPdfs 시험 — 파일을 읽어 결과 꼴({ results, hasProblems })과 문제 코드를 확인한다.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/check/index.mjs, docs/contract.md 「check 의 결과」.
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { checkPdfs } from '../../src/check/index.mjs'
import { applyPdfNavBytes } from '../../src/pdf/nav.mjs'
import { BOOK_OUTLINE, blankBytes, bookBytes, type3Bytes } from './fixtures.mjs'

let dir
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'typeset-kit-check-'))
})
after(() => rm(dir, { recursive: true, force: true }))

async function save(name, bytes) {
  const path = join(dir, name)
  await writeFile(path, bytes)
  return path
}

const codesOf = (result) => result.problems.map((problem) => problem.split(':')[0])

describe('checkPdfs', () => {
  test('맞게 만든 책은 통과하고 사실을 돌려준다', async () => {
    const { results, hasProblems } = await checkPdfs([await save('book.pdf', await bookBytes())], { cwd: dir, maxMb: 90 })
    assert.equal(hasProblems, false)
    assert.equal(results[0].status, 'ok')
    assert.equal(results[0].file, 'book.pdf')
    assert.deepEqual(results[0].problems, [])
    assert.deepEqual(
      { ...results[0].facts, bytes: undefined },
      {
        pages: 8,
        tocLines: 3,
        bookmarks: 5,
        bookmarkLevels: 2,
        links: 3,
        externalLinks: 0,
        pageLabels: ['표지', 'i-ii', '1-5'],
        landscapePages: 0,
        type3Fonts: 0,
        bytes: undefined,
      },
    )
  })

  test('책갈피 · 링크가 없는 PDF 는 no-bookmarks 와 page-mode 로 실패한다', async () => {
    const { results, hasProblems } = await checkPdfs([await save('blank.pdf', await blankBytes(2))], { cwd: dir, maxMb: 90 })
    assert.equal(hasProblems, true)
    assert.deepEqual(codesOf(results[0]), ['page-mode', 'no-bookmarks'])
  })

  test('쪽 번호 표기가 없으면 page-labels, 책갈피가 셋 단계면 bookmark-depth', async () => {
    const deep = [{ title: '장', pageIndex: 0, children: [{ title: '절', pageIndex: 1, children: [{ title: '소절', pageIndex: 1, children: [] }] }] }]
    const unlabeled = await bookBytes({ pageLabels: undefined })
    const { results } = await checkPdfs(
      [await save('nolabels.pdf', unlabeled), await save('deep.pdf', (await applyPdfNavBytes(await blankBytes(3), { outline: deep })).bytes)],
      { cwd: dir, maxMb: 90 },
    )
    assert.deepEqual(codesOf(results[0]), ['page-labels'])
    assert.deepEqual(codesOf(results[1]), ['bookmark-depth'])
  })

  test('본문 첫 쪽의 표기가 1 이 아니면 page-labels', async () => {
    const labels = [{ start: 0, prefix: '표지' }, { start: 1, style: 'r' }, { start: 4, style: 'D' }]
    const { results } = await checkPdfs([await save('late.pdf', await bookBytes({ pageLabels: labels }))], { cwd: dir, maxMb: 90 })
    assert.match(results[0].problems[0], /^page-labels: the first body page is labeled "i/)
  })

  test('책갈피가 가리키는 쪽이 같아도 차례 줄이 모자라면 toc-count', async () => {
    const links = [{ pageIndex: 2, rect: [48, 700, 550, 720], targetPageIndex: 3 }]
    const { results } = await checkPdfs([await save('short.pdf', await bookBytes({ links }))], { cwd: dir, maxMb: 90 })
    assert.deepEqual(codesOf(results[0]), ['toc-count'])
  })

  test('쪽에 없는 곳으로 가는 링크는 dead-links', async () => {
    const outline = [{ title: '쪽', pageIndex: 0, children: [] }]
    const bytes = (await applyPdfNavBytes(await blankBytes(2), { outline })).bytes
    const { PDFDocument, PDFName } = await import('pdf-lib')
    const doc = await PDFDocument.load(bytes)
    const annotation = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10], Dest: PDFName.of('nowhere') })
    doc.getPage(0).node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(annotation)]))
    const { results } = await checkPdfs([await save('dead.pdf', await doc.save())], { cwd: dir, maxMb: 90 })
    assert.deepEqual(codesOf(results[0]), ['dead-links'])
  })

  test('Type 3 글꼴은 type3-fonts 이고, allowType3 로 풀 수 있다', async () => {
    const path = await save('type3.pdf', await type3Bytes())
    const strict = await checkPdfs([path], { cwd: dir, maxMb: 90 })
    assert.deepEqual(codesOf(strict.results[0]), ['type3-fonts'])
    assert.equal(strict.results[0].facts.type3Fonts, 1)
    assert.equal((await checkPdfs([path], { cwd: dir, maxMb: 90, allowType3: true })).hasProblems, false)
  })

  test('크기 상한을 넘으면 pdf-size, 0 이면 상한이 없다', async () => {
    const path = await save('size.pdf', await bookBytes())
    const small = await checkPdfs([path], { cwd: dir, maxMb: 0.0001 })
    assert.deepEqual(codesOf(small.results[0]), ['pdf-size'])
    assert.equal((await checkPdfs([path], { cwd: dir, maxMb: 0 })).hasProblems, false)
  })

  test('없는 파일은 missing-file, PDF 가 아닌 파일은 unreadable 이다', async () => {
    const { results, hasProblems } = await checkPdfs([join(dir, 'none.pdf'), await save('text.pdf', 'hello')], { cwd: dir, maxMb: 90 })
    assert.equal(hasProblems, true)
    assert.deepEqual(results.map(codesOf), [['missing-file'], ['unreadable']])
    assert.equal(results[0].facts, null)
  })

  test('차례 이름은 옵션으로 바꿀 수 있다', async () => {
    const outline = BOOK_OUTLINE.map((item) => (item.title === '목차' ? { ...item, title: 'Index' } : item))
    const path = await save('index.pdf', await bookBytes({ outline }))
    assert.equal((await checkPdfs([path], { cwd: dir, maxMb: 90 })).results[0].facts.tocLines, null)
    assert.equal((await checkPdfs([path], { cwd: dir, maxMb: 90, tocTitles: ['Index'] })).results[0].facts.tocLines, 3)
  })

  test('크기 상한은 설정 파일의 limits.pdfMaxMb 를 따르고, 설정 파일이 없으면 90 이다', async () => {
    const withConfig = await mkdtemp(join(tmpdir(), 'typeset-kit-check-config-'))
    try {
      await writeFile(join(withConfig, 'typeset.config.json'), JSON.stringify({ documents: [{ id: 'a', mode: 'book', src: 'a.md' }], limits: { pdfMaxMb: 1 } }))
      const path = join(withConfig, 'big.pdf')
      const bytes = await bookBytes()
      await writeFile(path, Buffer.concat([bytes, Buffer.alloc(1.5 * 1024 * 1024)]))
      assert.deepEqual(codesOf((await checkPdfs([path], { cwd: withConfig })).results[0]), ['pdf-size'])
      assert.equal((await checkPdfs([path], { cwd: dir })).hasProblems, false, '설정 파일이 없는 폴더에서는 상한 90')
    } finally {
      await rm(withConfig, { recursive: true, force: true })
    }
  })
})
