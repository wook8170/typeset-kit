// doctor 실행 — Node · 설정 · 브라우저 · 책갈피 지원 · 글꼴의 사실을 모아 judge.mjs 의 판정에 넘긴다.
// 부르는 곳: cli/commands/doctor.mjs.
// 먼저 읽을 파일: doctor/judge.mjs(판정 규칙).
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browserVersion, withChrome } from '../browser/chrome.mjs'
import { findBrowser } from '../browser/find.mjs'
import { closeTab, openDocument } from '../browser/print.mjs'
import { ConfigError, findConfigFile, loadConfig } from '../config/load.mjs'
import { validateConfig } from '../config/validate.mjs'
import { isFile } from '../platform.mjs'
import { importStage, NotImplementedError } from '../stages.mjs'
import {
  collectFontSpecs,
  judgeBrowserLocation,
  judgeConfig,
  judgeFonts,
  judgeNode,
  judgeOutline,
} from './judge.mjs'

/** 패키지에 든 글꼴 폴더. 내장 글꼴 표의 경로는 이 폴더 기준이다. */
export const PACKAGE_FONTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../fonts')

/** 책갈피 시험 문서. 장 · 절 제목이 하나씩 있으면 Chrome 이 책갈피 두 개를 쓴다. */
const OUTLINE_PROBE_HTML =
  '<!doctype html><meta charset="utf-8"><div role="heading" aria-level="1">Chapter</div>' +
  '<div style="break-before:page" role="heading" aria-level="2">Section</div>'

/** 작은 문서를 구워 PDF 에 책갈피(/Outlines)가 생기는지 본다. */
async function probeOutline(cdp) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const call = (method, params) => cdp.send(method, params, sessionId)
  try {
    await openDocument(call, OUTLINE_PROBE_HTML, 0)
    const { data } = await call('Page.printToPDF', { generateDocumentOutline: true, preferCSSPageSize: true })
    return Buffer.from(data, 'base64').includes('/Outlines')
  } finally {
    await closeTab(cdp, targetId)
  }
}

async function readConfigFacts(cwd) {
  const file = findConfigFile(cwd)
  if (!file) return { facts: { isMissing: true }, config: null, root: cwd }
  try {
    const loaded = await loadConfig({ cwd, file })
    return { facts: { file, problems: [] }, config: loaded.config, root: loaded.root }
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    return { facts: { file, problems: error.problems }, config: null, root: dirname(file) }
  }
}

function locateBrowser(config, root, env) {
  try {
    const configuredPath = config?.browser.path ? resolve(root, config.browser.path) : undefined
    return { browserPath: findBrowser({ configuredPath, env }) }
  } catch (error) {
    return { error }
  }
}

async function readOutlineFacts(browserPath, launch) {
  try {
    return await launch(async (cdp) => {
      const { product } = await browserVersion(cdp)
      return { product, hasOutline: await probeOutline(cdp) }
    }, { browserPath })
  } catch (error) {
    return { error }
  }
}

async function loadBuiltinFonts() {
  try {
    return (await importStage('fonts:builtin')).BUILTIN_FONTS
  } catch (error) {
    if (error instanceof NotImplementedError) return null
    throw error
  }
}

/**
 * 점검을 돌려 결과 목록 [{ id, status, detail }] 을 돌려준다.
 * launch 는 브라우저를 띄우는 함수다(기본 withChrome). 테스트에서 가짜를 넣는다.
 */
export async function runDoctor({ cwd = process.cwd(), env = process.env, nodeVersion = process.versions.node, launch = withChrome } = {}) {
  const results = [judgeNode(nodeVersion)]
  const { facts, config, root } = await readConfigFacts(cwd)
  results.push(judgeConfig(facts))

  const location = locateBrowser(config, root, env)
  results.push(judgeBrowserLocation(location))
  if (location.browserPath) results.push(judgeOutline(await readOutlineFacts(location.browserPath, launch)))

  const fontConfig = config ?? validateConfig({ documents: [] }).config
  results.push(
    judgeFonts(collectFontSpecs(fontConfig), {
      builtinFonts: await loadBuiltinFonts(),
      builtinPath: (path) => resolve(PACKAGE_FONTS_DIR, path),
      resolveFile: (path) => resolve(root, path),
      fileExists: isFile,
    }),
  )
  return results
}
