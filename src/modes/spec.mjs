// spec 모드 — 책 명세 파일 하나를 읽어 검사하고, 인쇄판 HTML · PDF 로 굽고, 조판 보고를 돌려준다.
// 부르는 곳: build/index.mjs(문서마다 buildDocument(job)), modes/book.mjs(Markdown 을 명세로 바꾼 뒤 buildSpec 을 부른다).
// 먼저 읽을 파일: docs/contract.md 「모드 모듈 계약」, render/index.mjs(renderPrintHtml).
//
// 다른 레인이 만드는 단계(글꼴 CSS · 그림 넣기 · PDF 후처리 · 웹판)는 쓸 때만 불러온다. deps 로 바꿔 넣을 수 있다(테스트용).

import { rm, writeFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import { printPdf } from '../browser/print.mjs'
import { browserVersion } from '../browser/chrome.mjs'
import { readTextFile, toImportUrl, toPosixPath } from '../platform.mjs'
import { assignAnchors, DEFAULT_CALLOUT_KINDS, validateSpec } from '../spec/contract.mjs'
import { importStage } from '../stages.mjs'
import { defineTheme } from '../theme/index.mjs'
import { renderPrintHtml } from '../render/index.mjs'
import { localeWords } from '../render/locale/index.mjs'
import { svgProblem } from '../render/svg-guard.mjs'

const MB = 1024 * 1024

/** 명세 검사에 걸렸을 때의 오류. 문제 목록을 problems 에 담는다. */
export class SpecError extends Error {
  constructor(file, problems) {
    super(`Invalid book spec ${file}: ${problems.map((problem) => `${problem.code} ${problem.path}`).join(', ')}`)
    this.name = 'SpecError'
    this.problems = problems
  }
}

/** 기본 단계 불러오기. 계약 문서 1절의 파일과 함수 이름이다. */
const DEFAULT_DEPS = {
  fontCss: async (fonts, options) => (await import('../fonts/css.mjs')).fontCss(fonts, options),
  builtinFonts: async () => (await importStage('fonts:builtin')).BUILTIN_FONTS,
  inlineImages: async (spec, options) => (await import('../input/images.mjs')).inlineSpecImages(spec, options),
  applyPdfNavBytes: async (bytes, options) => (await import('../pdf/index.mjs')).applyPdfNavBytes(bytes, options),
  inspectPdf: async (bytes) => (await import('../pdf/index.mjs')).inspectPdf(bytes),
  renderWeb: async (spec, options) => (await import('../web/index.mjs')).renderWebHtml(spec, options),
}

// ── 판정(순수 함수) ─────────────────────────────────────────

/** PDF 쪽 번호 표기 — 표지는 낱말, 앞붙임은 로마 숫자, 본문은 1 부터. */
export function planPageLabels(frontCount, coverLabel) {
  return [
    { start: 0, prefix: coverLabel },
    ...(frontCount > 0 ? [{ start: 1, style: 'r' }] : []),
    { start: 1 + frontCount, style: 'D' },
  ]
}

/** 그림 넣기 단계가 필요한가. data 주소가 아닌 src, 또는 svgText 없이 inline 인 그림이 있으면 필요하다. */
export function needsImageInlining(spec) {
  return spec.chapters.some((chapter) =>
    chapter.sections.some((section) =>
      section.blocks.some((block) => block.t === 'figure' && ((block.src && !block.src.startsWith('data:')) || (block.inline && !block.svgText))),
    ),
  )
}

/** 그대로 넣는 SVG(그림 svgText · 표지 마크)의 허용 목록 위반. 문제마다 「svg-guard: 위치: 까닭」. */
export function findSvgProblems(spec, logoSvg) {
  const problems = []
  spec.chapters.forEach((chapter, ci) =>
    chapter.sections.forEach((section, si) =>
      section.blocks.forEach((block, bi) => {
        const problem = block.t === 'figure' && block.svgText ? svgProblem(block.svgText) : null
        if (problem) problems.push(`svg-guard: chapters.${ci}.sections.${si}.blocks.${bi}: ${problem}`)
      }),
    ),
  )
  const logoProblem = logoSvg ? svgProblem(logoSvg) : null
  if (logoProblem) problems.push(`svg-guard: brand.logo: ${logoProblem}`)
  return problems
}

/** 굽은 결과의 문제(넘친 쪽 · 크기 상한). pdfMaxMb 가 0 이면 크기 상한이 없다. */
export function judgePrinted({ overflow, allowOverflow, bytes, pdfMaxMb }) {
  const problems = []
  if (overflow.length && !allowOverflow) problems.push(`overflow: pages ${overflow.join(', ')}`)
  if (pdfMaxMb > 0 && bytes > pdfMaxMb * MB) problems.push(`pdf-size: ${(bytes / MB).toFixed(1)} MB exceeds ${pdfMaxMb} MB`)
  return problems
}

/** 글꼴 설정 → 글꼴 이름. builtin:<이름> 은 내장 글꼴 표에서 찾는다. */
export function fontFamilies(fonts, builtinTable = {}) {
  const familyOf = (font) => {
    if (typeof font !== 'string') return font.family
    const entry = builtinTable[font.slice('builtin:'.length)]
    if (!entry) throw new Error(`Unknown builtin font: ${font}`)
    return entry.family
  }
  return { sans: familyOf(fonts.sans), mono: familyOf(fonts.mono) }
}

// ── 실행 ────────────────────────────────────────────────────

/** 명세 파일을 읽는다(.json 또는 .mjs · .js 의 기본 내보내기). 파일이 없으면 null. */
async function readSpecFile(file) {
  try {
    if (extname(file) === '.json') return JSON.parse(await readTextFile(file))
    return (await import(toImportUrl(file))).default
  } catch (error) {
    // 그 파일이 가져오는 다른 파일이 없을 때는 원래 오류를 그대로 던진다(원고 실수를 「파일 없음」으로 가리지 않는다).
    if (error.code === 'ENOENT' || (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === toImportUrl(file))) return null
    throw error
  }
}

async function readLogo(root, logo) {
  if (!logo) return { logoSvg: '' }
  try {
    return { logoSvg: (await readTextFile(resolve(root, logo))).replace(/^<\?xml[^>]*>\s*/, '').trim() }
  } catch (error) {
    if (error.code === 'ENOENT') return { missing: `missing-file: ${logo}` }
    throw error
  }
}

const relativeOut = (job, file) => toPosixPath(relative(job.root, join(job.outDir, file)))

function emptyReport(document) {
  return {
    id: document.id, mode: document.mode, files: { pdf: null, printHtml: null, web: null },
    pages: null, frontPages: null, landscapePages: null, overflow: [], bookmarks: null, links: null,
    bytes: null, browser: null, problems: [],
  }
}

/** PDF 를 굽고, 쪽 번호 표기 · 책갈피 창 · 객체 스트림 저장을 붙인 뒤 크기를 본다. 상한을 넘으면 쓰지 않고 지난 파일도 지운다. */
async function printDocument(job, html, deps) {
  const { session, settings, document } = job
  const printed = await printPdf(session.cdp, html, { timeoutMs: session.timeoutMs })
  const coverLabel = localeWords(settings.locale).coverLabel
  const nav = await deps.applyPdfNavBytes(printed.pdf, { pageLabels: planPageLabels(printed.meta.front, coverLabel), objectStreams: true })
  const bytes = Buffer.from(nav.bytes)
  const info = await deps.inspectPdf(bytes)
  const problems = judgePrinted({ overflow: printed.meta.overflow, allowOverflow: job.allowOverflow, bytes: bytes.length, pdfMaxMb: settings.limits.pdfMaxMb })
  const file = `${document.out || document.id}.pdf`
  const isTooBig = problems.some((problem) => problem.startsWith('pdf-size'))
  if (isTooBig) await rm(join(job.outDir, file), { force: true })
  else await writeFile(join(job.outDir, file), bytes)
  return {
    files: { pdf: isTooBig ? null : relativeOut(job, file) },
    pages: printed.meta.pages, frontPages: printed.meta.front, overflow: printed.meta.overflow,
    landscapePages: info.landscapePages, bookmarks: info.outline.length, links: info.links.filter((link) => !link.external).length,
    bytes: bytes.length, browser: (await browserVersion(session.cdp)).product, problems,
  }
}

/** 명세 한 벌을 굽는다. book 모드도 Markdown 을 명세로 바꾼 뒤 이 함수를 부른다. */
export async function buildSpec(job, sourceSpec, deps = {}) {
  const use = { ...DEFAULT_DEPS, ...deps }
  const { settings, document, root } = job
  const report = emptyReport(document)
  const specProblems = validateSpec(sourceSpec, { calloutKinds: [...DEFAULT_CALLOUT_KINDS, ...Object.keys(settings.theme.callouts)] })
  if (specProblems.length) throw new SpecError(document.src, specProblems)
  const inlined = needsImageInlining(sourceSpec)
    ? await use.inlineImages(assignAnchors(sourceSpec), { root, limits: settings.limits, cdp: job.session?.cdp ?? null })
    : { spec: assignAnchors(sourceSpec), problems: [] }
  const spec = inlined.spec
  const logo = await readLogo(root, settings.brand.logo)
  const assetProblems = [...inlined.problems, ...(logo.missing ? [logo.missing] : []), ...findSvgProblems(spec, logo.logoSvg)]
  if (assetProblems.length) return { ...report, problems: assetProblems }

  const families = fontFamilies(settings.theme.fonts, await use.builtinFonts())
  const theme = defineTheme({ hue: spec.hue ?? settings.theme.hue, callouts: settings.theme.callouts, families })
  const fontCss = await use.fontCss([settings.theme.fonts.sans, settings.theme.fonts.mono], { root })
  const html = renderPrintHtml(spec, { settings, fontCss, logoSvg: logo.logoSvg, theme })
  const base = document.out || document.id
  const files = { ...report.files }
  if (job.outputs.printHtml) {
    await writeFile(join(job.outDir, `${base}.html`), html)
    files.printHtml = relativeOut(job, `${base}.html`)
  }
  if (job.outputs.web) {
    await writeFile(join(job.outDir, `${base}.web.html`), await use.renderWeb(spec, { settings, fontCss, theme }))
    files.web = relativeOut(job, `${base}.web.html`)
  }
  if (!job.outputs.pdf) return { ...report, files }
  const printed = await printDocument(job, html, use)
  return { ...report, ...printed, files: { ...files, ...printed.files } }
}

/** 모드 모듈 진입점. document.src 의 명세 파일을 읽어 굽는다. 파일이 없으면 missing-file 문제로 보고한다. */
export async function buildDocument(job, deps = {}) {
  const sources = [job.document.src].flat()
  if (sources.length !== 1) throw new Error(`spec mode takes exactly one src file (document ${job.document.id})`)
  const spec = await readSpecFile(resolve(job.root, sources[0]))
  if (!spec) return { ...emptyReport(job.document), problems: [`missing-file: ${sources[0]}`] }
  return buildSpec(job, spec, deps)
}
