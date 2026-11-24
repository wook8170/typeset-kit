// book 모드 시험 — Markdown 원고 여러 편 · 개정 이력 · 그림 경로를 책 명세로 모아 굽기, 없는 파일, 콜아웃 이름.
// 부르는 곳: npm test. 브라우저를 띄우지 않는다(인쇄판 HTML · 웹판만 낸다).
// 먼저 읽을 파일: src/modes/book.mjs, src/modes/spec.mjs(buildSpec).
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { buildDocument, calloutNames, docInfoFrom } from '../../src/modes/book.mjs'
import { variantSettings } from '../fixtures/virtual-book.mjs'

const scratch = mkdtempSync(join(tmpdir(), 'typeset-book-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>'

function project(name, document, outputs = { pdf: false, printHtml: true, web: true }) {
  const root = join(scratch, name)
  mkdirSync(join(root, 'docs/part/img'), { recursive: true })
  mkdirSync(join(root, 'out'), { recursive: true })
  writeFileSync(join(root, 'docs/intro.md'), '# 운영 안내서\n\n운영 담당자를 위한 안내.\n\n## 개요\n\n장 요약.\n\n### 범위\n\n> **경고** 지우면 되돌릴 수 없다.\n')
  writeFileSync(join(root, 'docs/part/next.md'), '## 설치\n\n### 파일\n\n![구성도](img/a.svg)\n')
  writeFileSync(join(root, 'docs/part/img/a.svg'), SVG)
  writeFileSync(join(root, 'docs/revisions.json'), JSON.stringify([['1.0', '2026-10-01', '처음 씀', 'Acme'], ['1.1', '2026-11-05', '설치 장', 'Acme']]))
  const full = { id: 'ops', mode: 'book', src: ['docs/intro.md', 'docs/part/next.md'], out: '', title: '', revisions: 'docs/revisions.json', ...document }
  return { document: full, settings: variantSettings('plain'), root, outDir: join(root, 'out'), outputs, allowOverflow: false, session: null }
}

describe('book 모드', () => {
  test('원고 여러 편을 한 권으로: 장 번호가 이어지고, 그림 경로는 원고 폴더 기준, 개정 이력은 문서 정보', async () => {
    const job = project('two-files', {})
    const report = await buildDocument(job)
    assert.deepEqual(report.problems, [])
    assert.deepEqual(report.files, { pdf: null, printHtml: 'out/ops.html', web: 'out/ops.web.html' })
    const html = readFileSync(join(job.root, 'out/ops.html'), 'utf8')
    assert.match(html, /<title>Acme Docs 운영 안내서<\/title>/)
    assert.ok(html.includes('<rect width="5" height="5"/>'), 'SVG 그림이 문서에 들어간다')
    assert.match(html, /2\.1/)
    assert.match(html, /2026\.11/, '발행 연월은 개정 이력의 마지막 날짜')
    const web = readFileSync(join(job.root, 'out/ops.web.html'), 'utf8')
    assert.match(web, /href="#ch1s0"/)
    assert.match(web, /class="bcallout"/)
  })
  test('원고 · 개정 이력 파일이 없으면 굽지 않고 missing-file 로 알린다', async () => {
    const report = await buildDocument(project('missing', { src: ['docs/none.md'], revisions: 'docs/none.json' }))
    assert.deepEqual(report.problems, ['missing-file: docs/none.md', 'missing-file: docs/none.json'])
    assert.equal(report.files.printHtml, null)
  })
  test('원고가 가리키는 그림이 없으면 missing-file 로 알린다', async () => {
    const job = project('missing-image', {})
    writeFileSync(join(job.root, 'docs/part/next.md'), '## 설치\n\n### 파일\n\n![없음](img/none.png)\n')
    const report = await buildDocument(job)
    assert.deepEqual(report.problems, ['missing-file: docs/part/img/none.png'])
  })
  test('원고에 제목이 없으면 문서 설정의 제목을 쓴다', async () => {
    const job = project('title', { src: 'docs/part/next.md', title: '설정 제목', revisions: '' })
    await buildDocument(job)
    assert.match(readFileSync(join(job.root, 'out/ops.html'), 'utf8'), /<title>Acme Docs 설정 제목<\/title>/)
  })
  test('개정 이력은 목록 또는 { revisions, … } 객체를 받는다', () => {
    assert.deepEqual(docInfoFrom([['1.0', '2026-01-01', 'a', 'b']]), { revisions: [['1.0', '2026-01-01', 'a', 'b']] })
    const info = { revisions: [], readers: ['운영 담당자'] }
    assert.equal(docInfoFrom(info), info)
    assert.throws(() => docInfoFrom({ readers: [] }), /revisions/)
  })
  test('콜아웃 이름: 언어 묶음의 표시 낱말과 설정에 더한 종류', () => {
    const settings = variantSettings('plain', { theme: { callouts: { tip: 'green' } } })
    assert.deepEqual(calloutNames(settings), { note: '참고', caution: '주의', warning: '경고', tip: 'tip' })
  })
})
