// init 명령 — 설정 파일 견본(typeset.config.mjs)과 예제 원고(docs/)를 만든다. 이미 있는 파일은 --force 없이는 덮어쓰지 않는다.
// 부르는 곳: cli/main.mjs.
// 먼저 읽을 파일: config/schema.mjs(견본이 맞춰야 할 키), examples/<언어>/docs(복사하는 예제 원고).
import { lstatSync } from 'node:fs'
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isInsideRoot, isMissingFileError } from '../../platform.mjs'
import { EXIT } from '../exit.mjs'

export const options = { force: { type: 'boolean' }, locale: { type: 'string' } }

export const INIT_FILE = 'typeset.config.mjs'

/** 패키지에 든 예제 폴더. 언어마다 docs/ 아래에 원고 · 개정 이력 · 그림이 있다. */
export const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../examples')

/** 견본 설정의 글(순수 함수). 이 글을 그대로 가져와 검사해도 문제가 없어야 한다(테스트가 확인한다). */
export function initConfigSource(locale = 'ko') {
  const isKorean = locale === 'ko'
  return `// typeset-kit 설정. 키 목록은 typeset-kit 의 docs/contract.md 「설정 계약」에 있다.
export default {
  locale: '${isKorean ? 'ko' : 'en'}',
  outDir: 'typeset-out',
  brand: { name: 'Acme Docs', publisher: 'Acme Inc.', contact: 'https://example.com' },
  cover: { meta: [['${isKorean ? '문서번호' : 'Document'}', 'DOC-01'], ['${isKorean ? '적용 버전' : 'Version'}', '1.0']] },
  documents: [
    { id: 'guide', mode: 'book', src: 'docs/guide.md', title: '${isKorean ? '사용 안내서' : 'User Guide'}', revisions: 'docs/guide.revisions.json' },
  ],
  writing: { languages: ['${isKorean ? 'ko' : 'en'}'] },
}
`
}

/** 폴더 안의 파일 목록(하위 폴더 포함, 기준 폴더에 대한 상대 경로). */
async function listFiles(dir, base = dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(path, base)))
    else files.push(relative(base, path))
  }
  return files
}

/** 만들 파일 목록 — 설정 파일 하나와 그 언어의 예제 파일들. */
async function plannedFiles(cwd, locale) {
  const exampleRoot = join(EXAMPLES_DIR, locale)
  const examples = (await listFiles(exampleRoot)).map((file) => ({ from: join(exampleRoot, file), to: join(cwd, file) }))
  return { config: join(cwd, INIT_FILE), examples }
}

/** 그 자리에 무엇인가 있는가. 끊어진 심볼릭 링크도 「있음」이다(쓰면 링크가 가리키는 곳에 파일이 생기기 때문이다). */
function isOccupied(file) {
  try {
    lstatSync(file)
    return true
  } catch (error) {
    if (!isMissingFileError(error)) throw error
    return false
  }
}

/** 파일 하나를 쓴다. 그 자리에 있던 것(파일 · 심볼릭 링크)은 먼저 지운다. 링크를 따라가 다른 곳의 파일을 덮어쓰지 않기 위해서다. */
async function placeFile(target, write) {
  await mkdir(dirname(target), { recursive: true })
  await rm(target, { force: true })
  await write(target)
}

/**
 * 만들 파일 중 하나라도 이미 있으면 --force 없이는 아무것도 쓰지 않는다.
 * 만들 자리가 심볼릭 링크를 거쳐 지금 폴더 밖으로 나가면 --force 가 있어도 쓰지 않는다.
 */
export async function run({ values }, io) {
  const locale = values.locale ?? 'ko'
  if (!['ko', 'en'].includes(locale)) {
    io.err(io.messages.initLocale(locale))
    return EXIT.usage
  }
  const plan = await plannedFiles(io.cwd, locale)
  const targets = [plan.config, ...plan.examples.map((file) => file.to)]
  const outside = targets.filter((file) => !isInsideRoot(io.cwd, dirname(file)))
  if (outside.length) {
    io.err(io.messages.initOutside(outside.join(', ')))
    return EXIT.failed
  }
  const existing = targets.filter(isOccupied)
  if (existing.length && !values.force) {
    io.err(io.messages.initExists(existing.join(', ')))
    return EXIT.failed
  }
  await placeFile(plan.config, (target) => writeFile(target, initConfigSource(locale), { flag: 'wx' }))
  for (const file of plan.examples) await placeFile(file.to, (target) => copyFile(file.from, target))
  io.out(io.messages.initCreated(targets.join(', ')))
  return EXIT.ok
}
