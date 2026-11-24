// pages 모드 — 이미 판형대로 짠 HTML 원고(브로셔 · 소책자)를 면마다 굽고, 한 권으로 합쳐 책갈피를 붙인다.
// 부르는 곳: build/index.mjs(문서의 mode 가 pages 일 때, stages.mjs 의 mode:pages).
// 먼저 읽을 파일: docs/contract.md 「모드 모듈 계약」, modes/pages/*(원고 다듬기 · 차례 · 책갈피 도우미).
import { readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative } from 'node:path'
import { printPdf } from '../browser/print.mjs'
import { browserVersion } from '../browser/chrome.mjs'
import { inspectPdf } from '../pdf/inspect.mjs'
import { mergePdfs } from '../pdf/merge.mjs'
import { applyPdfNavBytes } from '../pdf/nav.mjs'
import { toPosixPath } from '../platform.mjs'
import { inlineAssets } from './pages/assets.mjs'
import { loadFonts } from './pages/fonts.mjs'
import { flattenTree, shiftTree, treeFromFaces, treeFromFlat } from './pages/outline.mjs'
import { expandSources } from './pages/sources.mjs'
import { fillVars, pageTitle, preparePage } from './pages/template.mjs'
import { localeWords } from '../render/locale/index.mjs'
import { tocHtml, tocLinks, tocPageCount } from './pages/toc.mjs'

const BYTES_PER_MB = 1024 * 1024

/** 원고 파일 하나를 읽어 자리표시자 · 로컬 파일 참조를 채운다. 돌려주는 값 = { title, html, problems }. */
async function loadPage(file, vars, root) {
  const shown = toPosixPath(relative(root, file))
  const filled = fillVars(await readFile(file, 'utf8'), vars)
  const inlined = await inlineAssets(filled.html, dirname(file))
  const problems = [
    ...filled.missing.map((name) => `missing-var: {{${name}}} in ${shown} has no value in vars`),
    ...inlined.missing.map((reference) => `missing-file: ${reference} referenced by ${shown}`),
  ]
  return { title: pageTitle(inlined.html) || basename(file, extname(file)), html: inlined.html, problems }
}

async function loadPages(job) {
  const { document, root } = job
  const { files, missing } = await expandSources(document.src, root)
  const problems = missing.map((pattern) => `missing-file: no file matches ${pattern}`)
  const pages = []
  for (const file of files) {
    const page = await loadPage(file, document.vars ?? {}, root)
    problems.push(...page.problems)
    pages.push(page)
  }
  return { pages, problems }
}

function emptyReport(document) {
  return {
    id: document.id,
    mode: document.mode,
    files: { pdf: null, printHtml: null, web: null },
    pages: null,
    frontPages: null,
    landscapePages: null,
    overflow: [],
    bookmarks: null,
    links: null,
    bytes: null,
    browser: null,
    problems: [],
  }
}

async function bakePage(session, html) {
  return (await printPdf(session.cdp, html, { timeoutMs: session.timeoutMs })).pdf
}

/** 합친 PDF 에 차례 면을 앞에 붙이고, 차례 링크 · 책갈피 · 쪽 번호 표기(차례 로마 숫자, 본문 1부터)를 단다. */
async function addToc({ session, settings, fonts, bodyBytes, tree }) {
  const heading = localeWords(settings.locale).pagesTocTitle
  const rows = flattenTree(tree).map((row) => ({ ...row, number: row.pageIndex + 1 }))
  const frontPages = tocPageCount(rows.length)
  const tocPdf = await bakePage(session, tocHtml(rows, { heading, family: fonts.family, fontCss: fonts.css }))
  const merged = await mergePdfs([tocPdf, bodyBytes])
  const front = merged.starts[1]
  const { bytes } = await applyPdfNavBytes(merged.bytes, {
    outline: [{ title: heading, pageIndex: 0, children: [] }, ...shiftTree(tree, front)],
    links: tocLinks(rows.map((row) => row.pageIndex + front)),
    pageLabels: [{ start: 0, style: 'r' }, { start: front, style: 'D' }],
    objectStreams: true,
  })
  return { bytes, frontPages }
}

/** 면 PDF 들을 한 권으로 만든다. 면이 둘 이상이면 면 제목이 책갈피가 되고, 하나면 Chrome 이 쓴 책갈피를 따른다. */
async function assemble({ session, settings, document, fonts, pages, pdfs }) {
  const isSingle = pdfs.length === 1
  const merged = isSingle ? { bytes: pdfs[0], starts: [0] } : await mergePdfs(pdfs)
  const chromeOutline = isSingle ? (await inspectPdf(pdfs[0])).outline : []
  const fallback = treeFromFaces(pages.map((page) => page.title), merged.starts)
  const tree = chromeOutline.length > 0 ? treeFromFlat(chromeOutline) : fallback
  if (document.toc) return addToc({ session, settings, fonts, bodyBytes: merged.bytes, tree })
  const outline = chromeOutline.length > 0 ? undefined : tree
  const { bytes } = await applyPdfNavBytes(merged.bytes, { outline, objectStreams: true })
  return { bytes, frontPages: 0 }
}

async function writePdf(job, report, bytes) {
  const { document, settings, root, outDir } = job
  const path = join(outDir, `${document.out || document.id}.pdf`)
  await writeFile(path, bytes)
  const limit = settings.limits.pdfMaxMb
  if (limit > 0 && bytes.length > limit * BYTES_PER_MB) {
    await rm(path, { force: true })
    report.problems.push(`pdf-size: ${(bytes.length / BYTES_PER_MB).toFixed(1)} MB is over the ${limit} MB limit`)
    return
  }
  report.files.pdf = toPosixPath(relative(root, path))
}

async function fillPdfReport(report, bytes, frontPages, session) {
  const info = await inspectPdf(bytes)
  Object.assign(report, {
    pages: info.pages,
    frontPages,
    landscapePages: info.landscapePages,
    bookmarks: info.outline.length,
    links: info.links.filter((link) => !link.external).length,
    bytes: info.bytes,
    browser: (await browserVersion(session.cdp)).product,
  })
}

async function bakeDocument(job, report, pages) {
  const { session, settings, root, document } = job
  const fonts = loadFonts(settings, root)
  const pdfs = []
  for (const page of pages) pdfs.push(await bakePage(session, preparePage(page.html, { fontCss: fonts.css })))
  const { bytes, frontPages } = await assemble({ session, settings, document, fonts, pages, pdfs })
  await fillPdfReport(report, bytes, frontPages, session)
  await writePdf(job, report, bytes)
}

/**
 * pages 모드 문서를 굽는다(계약의 buildDocument). 원고의 {{이름}} 이 vars 에 없거나 원고가 가리키는 파일이 없으면 굽지 않고 문제로 알린다.
 * 원고가 하나일 때만 인쇄판 HTML 을 낸다. 여러 개이면 하나의 HTML 로 묶을 수 없어 내지 않는다(files.printHtml = null).
 * 면이 여러 개면 면 사이로 가는 링크는 만들지 않는다. 넘친 쪽 판정은 pages 모드에 없다(overflow 는 항상 빈 목록).
 */
export async function buildDocument(job) {
  const { document, root, outDir, outputs, session } = job
  const report = emptyReport(document)
  const { pages, problems } = await loadPages(job)
  report.problems.push(...problems)
  if (report.problems.length > 0) return report
  if (outputs.printHtml && pages.length === 1) {
    const path = join(outDir, `${document.out || document.id}.html`)
    await writeFile(path, pages[0].html, 'utf8')
    report.files.printHtml = toPosixPath(relative(root, path))
  }
  if (outputs.pdf && session) await bakeDocument(job, report, pages)
  return report
}
