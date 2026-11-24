// PDF 검사 — PDF 파일마다 차례 · 책갈피 · 링크 · 쪽 번호 표기 · 글꼴 · 크기를 읽어 문제를 모은다.
// 부르는 곳: index.mjs(check), cli/commands/check.mjs.
// 먼저 읽을 파일: check/rules.mjs(규칙), docs/contract.md 「check 의 결과」.
import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { ConfigError, loadConfig } from '../config/load.mjs'
import { inspectPdf } from '../pdf/inspect.mjs'
import {
  checkBookmarks,
  checkFonts,
  checkLinks,
  checkPageLabels,
  checkPageMode,
  checkSize,
  checkToc,
  findToc,
  summarizeLabels,
} from './rules.mjs'

const DEFAULT_MAX_MB = 90

/** 크기 상한(MB)을 정한다. 옵션 → 설정 파일의 limits.pdfMaxMb → 기본값 순서다. 설정 파일이 없는 것은 오류가 아니다. */
async function resolveMaxMb(options) {
  if (options.maxMb !== undefined) return options.maxMb
  try {
    const { config } = await loadConfig({ cwd: options.cwd, file: options.configFile })
    return config.limits.pdfMaxMb
  } catch (error) {
    if (error instanceof ConfigError && error.problems.every((problem) => problem.code === 'config-not-found')) return DEFAULT_MAX_MB
    throw error
  }
}

function factsOf(info, toc) {
  const internal = info.links.filter((link) => !link.external).length
  return {
    pages: info.pages,
    tocLines: toc ? toc.lines.length : null,
    bookmarks: info.outline.length,
    bookmarkLevels: info.outline.length === 0 ? 0 : Math.max(...info.outline.map((item) => item.depth)) + 1,
    links: internal,
    externalLinks: info.links.length - internal,
    pageLabels: summarizeLabels(info.pageLabels),
    landscapePages: info.landscapePages,
    type3Fonts: info.type3Fonts,
    bytes: info.bytes,
  }
}

function judge(info, options, maxMb) {
  const toc = findToc(info, options.tocTitles)
  const problems = [
    ...checkPageMode(info),
    ...checkBookmarks(info, options),
    ...checkLinks(info),
    ...checkToc(toc),
    ...checkPageLabels(info, toc),
    ...checkFonts(info, options),
    ...checkSize(info, maxMb),
  ]
  return { problems, facts: factsOf(info, toc) }
}

async function checkOne(path, options, maxMb) {
  const file = relative(options.cwd, path).split('\\').join('/') || path
  let bytes
  try {
    bytes = await readFile(path)
  } catch (error) {
    return { file, status: 'fail', problems: [`missing-file: cannot read ${file} (${error.code ?? error.message})`], facts: null }
  }
  let info
  try {
    info = await inspectPdf(bytes)
  } catch (error) {
    return { file, status: 'fail', problems: [`unreadable: not a readable PDF (${error.message})`], facts: null }
  }
  const { problems, facts } = judge(info, options, maxMb)
  return { file, status: problems.length === 0 ? 'ok' : 'fail', problems, facts }
}

/**
 * PDF 파일들을 검사한다. 돌려주는 값 = { results, hasProblems }.
 * options = { cwd, configFile, maxMb, tocTitles, maxOutlineDepth, allowType3 }. 모두 고르는 값이다.
 */
export async function checkPdfs(paths, options = {}) {
  const resolved = { cwd: process.cwd(), ...options }
  const maxMb = await resolveMaxMb(resolved)
  const results = []
  for (const path of paths) results.push(await checkOne(path, resolved, maxMb))
  return { results, hasProblems: results.some((result) => result.status === 'fail') }
}
