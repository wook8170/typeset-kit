// 공개 진입점 `typeset-kit` — 굽기(build) · PDF 검사(check) · 글쓰기 검사(checkWriting)와 설정 읽기를 내보낸다.
// 부르는 곳: 패키지 사용자, cli/commands/*.
// 먼저 읽을 파일: docs/contract.md(블록 · 설정 · 모드 계약), build/index.mjs(굽기 흐름).
import { loadConfig } from './config/load.mjs'
import { importStage } from './stages.mjs'

export { build, planOutputs } from './build/index.mjs'
export { loadConfig, findConfigFile, ConfigError } from './config/load.mjs'
export { validateConfig } from './config/validate.mjs'
export { documentSettings, selectDocuments } from './config/document.mjs'
export { NotImplementedError } from './stages.mjs'

/** PDF 파일들을 검사한다. 돌려주는 값 = { results, hasProblems }. 구현은 check/index.mjs 의 checkPdfs 다. */
export async function check(pdfPaths, options = {}) {
  const { checkPdfs } = await importStage('check')
  return checkPdfs(pdfPaths, options)
}

/**
 * 글쓰기 규칙을 검사한다. options = { cwd, configFile, mode: 'report' | 'check' | 'update-baseline' }.
 * 돌려주는 값 = { findings, hasProblems }. 구현은 writing/index.mjs 의 checkWriting 이다.
 */
export async function checkWriting({ cwd = process.cwd(), configFile, mode = 'report' } = {}) {
  const { root, config } = await loadConfig({ cwd, file: configFile })
  const writing = await importStage('writing')
  return writing.checkWriting({ root, config, mode })
}
