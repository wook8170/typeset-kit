// 굽기 흐름 — 설정을 읽고, 문서를 고르고, 문서마다 모드 모듈에 굽기를 맡긴 뒤 조판 보고를 모은다.
// 부르는 곳: cli/commands/build.mjs, 공개 진입점 index.mjs(build).
// 먼저 읽을 파일: docs/contract.md 「모드 모듈 계약」, config/document.mjs(문서별 설정).
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { withChrome } from '../browser/chrome.mjs'
import { documentSettings, selectDocuments } from '../config/document.mjs'
import { loadConfig } from '../config/load.mjs'
import { importStage } from '../stages.mjs'

export const REPORT_FILE = 'typeset-report.json'

/**
 * 출력 선택(순수 함수). 아무것도 고르지 않으면 PDF 와 인쇄판 HTML 을 낸다.
 * htmlOnly 는 PDF 없이 인쇄판 HTML 만 낸다. 웹판은 web 을 줄 때만 낸다.
 */
export function planOutputs({ pdf = false, web = false, htmlOnly = false } = {}) {
  if (htmlOnly) return { pdf: false, printHtml: true, web }
  if (!pdf && !web) return { pdf: true, printHtml: true, web: false }
  return { pdf, printHtml: pdf, web }
}


async function loadModes(documents) {
  const modes = {}
  for (const mode of new Set(documents.map((document) => document.mode))) modes[mode] = await importStage(`mode:${mode}`)
  return modes
}

/**
 * 설정의 문서를 굽는다. options = { cwd, configFile, ids, outputs, allowOverflow }.
 * 돌려주는 값 = { root, outDir, reports, hasProblems }. 보고는 outDir/typeset-report.json 에도 쓴다.
 */
export async function build({ cwd = process.cwd(), configFile, ids = [], outputs = planOutputs(), allowOverflow = false } = {}) {
  const { root, config } = await loadConfig({ cwd, file: configFile })
  const documents = selectDocuments(config.documents, ids)
  const modes = await loadModes(documents)
  const outDir = resolve(root, config.outDir)
  await mkdir(outDir, { recursive: true })

  const buildAll = async (session) => {
    const reports = []
    for (const document of documents) {
      const settings = documentSettings(config, document)
      const job = { document, settings, root, outDir, outputs, allowOverflow, session }
      reports.push(await modes[document.mode].buildDocument(job))
    }
    return reports
  }
  // 브라우저는 PDF 를 구울 때만 띄운다. 인쇄판 HTML · 웹판만 낼 때는 띄우지 않는다.
  const reports = outputs.pdf
    ? await withChrome((cdp, info) => buildAll({ cdp, browserPath: info.browserPath, timeoutMs: config.browser.timeoutMs }), {
        browserPath: config.browser.path ? resolve(root, config.browser.path) : undefined,
      })
    : await buildAll(null)

  await writeFile(join(outDir, REPORT_FILE), `${JSON.stringify({ documents: reports }, null, 2)}\n`)
  return { root, outDir, reports, hasProblems: reports.some((report) => report.problems.length > 0) }
}
