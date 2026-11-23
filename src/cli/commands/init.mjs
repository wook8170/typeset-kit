// init 명령 — 설정 파일 견본(typeset.config.mjs)을 만든다. 이미 있으면 --force 없이는 덮어쓰지 않는다.
// 부르는 곳: cli/main.mjs.
// 먼저 읽을 파일: config/schema.mjs(견본이 맞춰야 할 키).
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { EXIT } from '../exit.mjs'

export const options = { force: { type: 'boolean' }, locale: { type: 'string' } }

export const INIT_FILE = 'typeset.config.mjs'

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
    { id: 'guide', mode: 'book', src: 'docs/guide.md', title: '${isKorean ? '사용 안내서' : 'User Guide'}' },
  ],
}
`
}

export async function run({ values }, io) {
  const file = join(io.cwd, INIT_FILE)
  if (existsSync(file) && !values.force) {
    io.err(io.messages.initExists(file))
    return EXIT.failed
  }
  await writeFile(file, initConfigSource(values.locale ?? 'ko'))
  io.out(io.messages.initCreated(file))
  return EXIT.ok
}
