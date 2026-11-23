// 설정 읽기 — 설정 파일을 찾아 읽고 검증한다. 문제가 있으면 ConfigError 를 던진다.
// 부르는 곳: cli/commands/*(명령마다 먼저 부른다), 공개 진입점 index.mjs.
// 먼저 읽을 파일: config/validate.mjs(검사), config/schema.mjs(키와 기본값).
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { isFile, toImportUrl } from '../platform.mjs'
import { CONFIG_FILES } from './schema.mjs'
import { validateConfig } from './validate.mjs'

/** 설정 오류. 명령은 이 오류를 종료 코드 2 로 바꾼다. problems 는 [{ path, code, expected, got }] 다. */
export class ConfigError extends Error {
  constructor(problems, file) {
    super(problems.map((problem) => `${problem.code} ${problem.path ?? ''}`.trim()).join('; '))
    this.name = 'ConfigError'
    this.problems = problems
    this.file = file
  }
}

/** startDir 에서 위로 올라가며 설정 파일을 찾는다. 한 폴더에 둘 다 있으면 .mjs 가 먼저다. 없으면 null 이다. */
export function findConfigFile(startDir, fileExists = isFile) {
  let current = resolve(startDir)
  for (;;) {
    const found = CONFIG_FILES.map((name) => join(current, name)).find((candidate) => fileExists(candidate))
    if (found) return found
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

async function readRawConfig(file) {
  if (file.endsWith('.json')) {
    try {
      return JSON.parse(await readFile(file, 'utf8'))
    } catch (error) {
      throw new ConfigError([{ path: file, code: 'invalid-json', got: error.message }], file)
    }
  }
  const loaded = await import(toImportUrl(file))
  return loaded.default
}

/**
 * 설정을 읽어 { root, file, config } 로 돌려준다. root 는 설정 파일이 있는 폴더이고, 설정 안의 상대 경로는 이 폴더 기준이다.
 * file 을 주면 그 파일을, 주지 않으면 cwd 에서 위로 찾는다.
 */
export async function loadConfig({ cwd = process.cwd(), file } = {}) {
  const configFile = file ? resolve(cwd, file) : findConfigFile(cwd)
  if (!configFile || !isFile(configFile)) {
    throw new ConfigError([{ path: file ?? CONFIG_FILES.join(' | '), code: 'config-not-found' }], configFile)
  }
  const { config, problems } = validateConfig(await readRawConfig(configFile))
  if (problems.length > 0) throw new ConfigError(problems, configFile)
  return { root: dirname(configFile), file: configFile, config }
}
