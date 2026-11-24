// 플랫폼 차이 — Windows 와 macOS · Linux 가 다르게 다루는 것(경로 · 줄바꿈 · 실행 파일 찾기 · 임시 폴더 지우기)을 한곳에서 정한다.
// 부르는 곳: browser/find.mjs(브라우저 찾기), browser/chrome.mjs(임시 프로필), config/load.mjs(설정 가져오기), cli/main.mjs(진입 판정).
// 먼저 읽을 파일: 없음. isEntryScript · findExecutable · removeTree · readTextFile 만 디스크를 만지고 나머지는 순수 함수다.
import { realpathSync, statSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { posix, resolve, win32 } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const WINDOWS = 'win32'

/** 그 플랫폼의 경로 함수 묶음. 테스트에서 다른 플랫폼을 흉내 낼 때 쓴다. */
export const pathApiOf = (platform = process.platform) => (platform === WINDOWS ? win32 : posix)

// ── 줄바꿈 ───────────────────────────────────────────────

/** 글을 줄로 나눈다. CRLF 로 저장된 파일에서도 줄 끝에 `\r` 이 남지 않는다. */
export const splitLines = (text) => text.split(/\r?\n/)

/** CRLF · CR 줄바꿈을 LF 로 바꾼다. 원고는 어느 플랫폼에서 저장했든 이 꼴로 읽는다. */
export const toLf = (text) => text.replace(/\r\n?/g, '\n')

/** 글 파일을 읽어 줄바꿈을 LF 로 맞춰 돌려준다. 머리의 BOM 도 뺀다. */
export async function readTextFile(filePath) {
  const text = await readFile(filePath, 'utf8')
  return toLf(text.startsWith('\uFEFF') ? text.slice(1) : text)
}

// ── 경로 ─────────────────────────────────────────────────

/** 경로를 `/` 로 나눈 꼴로 맞춘다. 기준선 · 조판 보고 · 오류 문구에 쓰는 경로는 어느 플랫폼에서든 이 꼴이다. */
export const toPosixPath = (filePath, platform = process.platform) =>
  platform === WINDOWS ? filePath.replaceAll('\\', '/') : filePath

/** 두 절대 경로가 같은 곳인가. Windows 는 대소문자와 구분자(`/` · `\`)를 가리지 않는다. */
export function isSamePath(left, right, platform = process.platform) {
  const pathApi = pathApiOf(platform)
  const toComparable = (filePath) =>
    platform === WINDOWS ? pathApi.normalize(filePath).toLowerCase() : pathApi.normalize(filePath)
  return toComparable(left) === toComparable(right)
}

/**
 * 실제 경로(심볼릭 링크를 따라간 경로). 아직 없는 파일은 있는 데까지의 윗폴더를 실제 경로로 바꾸고 나머지 이름을 붙인다.
 * 임시 폴더처럼 윗폴더가 링크인 곳에서, 없는 파일도 있는 파일과 같은 기준으로 견주기 위해서다.
 */
function realPathOf(filePath, pathApi) {
  const missingNames = []
  for (let current = filePath; ; current = pathApi.dirname(current)) {
    try {
      return pathApi.join(realpathSync(current), ...missingNames)
    } catch (error) {
      if (!isMissingFileError(error) || pathApi.dirname(current) === current) throw error
      missingNames.unshift(pathApi.basename(current))
    }
  }
}

/**
 * 파일이 root 폴더 안에 있는가. 심볼릭 링크를 따라간 실제 경로로 견준다. 그래서 폴더 안의 링크가 폴더 밖 파일을 가리키면 밖이다.
 * 원고가 가리키는 파일(그림 · 스타일시트)을 읽기 전에 부른다. 원고가 프로젝트 밖 파일을 문서에 싣지 못하게 하기 위해서다.
 */
export function isInsideRoot(root, filePath) {
  const pathApi = pathApiOf()
  const between = pathApi.relative(realPathOf(pathApi.resolve(root), pathApi), realPathOf(pathApi.resolve(filePath), pathApi))
  return between !== '..' && !between.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(between)
}

/** 절대 경로를 `import()` 에 넘길 주소로 바꾼다. Windows 의 `C:\…` 를 그대로 넘기면 가져오기가 실패한다. */
export const toImportUrl = (absolutePath) => pathToFileURL(absolutePath).href

/**
 * 지금 도는 스크립트가 이 모듈 파일인가(`node bin/typeset-kit.mjs` 로 직접 불렸는가).
 * Node 는 모듈 주소를 링크를 따라간 실제 경로로 만든다. 그래서 인자의 경로도 실제 경로로 바꿔 견준다.
 */
export function isEntryScript(scriptPath, moduleUrl, platform = process.platform) {
  if (!scriptPath) return false
  try {
    return isSamePath(realpathSync(resolve(scriptPath)), fileURLToPath(moduleUrl), platform)
  } catch (error) {
    // 인자가 파일이 아닌 실행(예: 테스트 실행기가 넘긴 이름)에서는 직접 불린 것이 아니다.
    if (error.code !== 'ENOENT') throw error
    return false
  }
}

// ── 실행 파일 찾기 ───────────────────────────────────────

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD'

/** PATH 환경 변수에서 폴더를 나누는 글자. */
export const pathListSeparator = (platform = process.platform) => (platform === WINDOWS ? ';' : ':')

/**
 * 한 폴더에서 찾아볼 파일 이름들. Windows 에서는 PATHEXT 의 확장자를 붙인 이름을 먼저 본다.
 * 확장자 없는 이름을 먼저 보면 셸 스크립트가 함께 놓인 명령에서 실행할 수 없는 파일이 잡힌다.
 */
export function executableNames(name, env, platform = process.platform) {
  if (platform !== WINDOWS) return [name]
  const extensions = (env.PATHEXT || DEFAULT_PATHEXT).split(';').filter(Boolean)
  return [...extensions.map((extension) => `${name}${extension.toLowerCase()}`), name]
}

/** 파일이 있는가. 폴더나 없는 경로는 false 다. */
export function isFile(filePath) {
  try {
    return statSync(filePath).isFile()
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false
    throw error
  }
}

/**
 * PATH 에서 실행 파일을 찾아 절대 경로를 돌려준다. 없으면 null 이다.
 * fileExists 는 테스트에서 디스크 대신 넣는 판정 함수다.
 */
export function findExecutable(name, { env = process.env, platform = process.platform, fileExists = isFile } = {}) {
  const pathApi = pathApiOf(platform)
  const folders = (env.PATH ?? env.Path ?? '').split(pathListSeparator(platform)).filter(Boolean)
  for (const folder of folders) {
    for (const fileName of executableNames(name, env, platform)) {
      const candidate = pathApi.join(folder, fileName)
      if (fileExists(candidate)) return candidate
    }
  }
  return null
}

// ── 임시 폴더 ────────────────────────────────────────────

/** 지우기를 다시 시도하는 횟수. Windows 에서는 브라우저가 끝난 직후 프로필 파일이 잠깐 잠겨 있다. */
export const REMOVE_RETRIES = 5

/** 폴더를 통째로 지운다. 잠긴 파일(EBUSY · EPERM)은 잠시 뒤 다시 시도한다. 없는 폴더는 오류가 아니다. */
export function removeTree(dirPath) {
  return rm(dirPath, { recursive: true, force: true, maxRetries: REMOVE_RETRIES, retryDelay: 200 })
}

/** 파일 · 폴더가 없어서 난 오류인가. 「없으면 없음」으로 다룰 곳에서 이 경우만 값으로 바꾸고 나머지(권한 등)는 그대로 던진다. */
export const isMissingFileError = (error) => ['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error?.code)

/** 작업 하나를 실행하고, 파일이 없어서 실패하면 null 을 돌려준다. 다른 오류는 그대로 던진다. */
export async function nullIfMissing(task) {
  try {
    return await task()
  } catch (error) {
    if (isMissingFileError(error)) return null
    throw error
  }
}
