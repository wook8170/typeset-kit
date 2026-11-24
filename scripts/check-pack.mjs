// 패키지 점검 — `npm pack` 이 싣는 파일 목록을 읽어, 있어야 할 파일 · 없어야 할 파일 · 크기 · 내부 경로 흔적을 확인한다.
// 부르는 곳: CI(.github/workflows/ci.yml)와 릴리스 전 수동 점검(`node scripts/check-pack.mjs`).
// 먼저 읽을 파일: package.json 의 files.
//
// 금지어 목록은 저장소에 두지 않는다. 환경 변수 TYPESET_KIT_DENYLIST 가 가리키는 파일(한 줄에 정규식 하나, # 은 주석)이 있으면 함께 본다.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** 패키지 크기 상한(풀었을 때). 내장 글꼴 약 1.2 MB 에 코드 · 예제를 더한 값보다 넉넉하게 잡았다. */
const MAX_UNPACKED_BYTES = 3 * 1024 * 1024

const REQUIRED = [
  'package.json', 'LICENSE', 'README.md', 'README.ko.md', 'THIRD-PARTY-NOTICES.md', 'bin/typeset-kit.mjs', 'src/index.mjs', 'docs/contract.md',
  'fonts/FONTS.md', 'fonts/OFL-NotoSansKR.txt', 'fonts/OFL-JetBrainsMono.txt',
  'fonts/NotoSansKR-400.woff2', 'fonts/NotoSansKR-700.woff2', 'fonts/JetBrainsMono-400.woff2', 'fonts/JetBrainsMono-700.woff2',
  'rules/ko.mjs', 'rules/en.mjs', 'rules/SOURCE.json',
  'examples/ko/docs/guide.md', 'examples/en/docs/guide.md', 'examples/report/typeset.config.mjs', 'examples/report/docs/report.md',
]
/** 패키지에 실리면 안 되는 경로. 테스트 · 작업 폴더 · 구운 결과 · 임시 파일이다. */
const FORBIDDEN = [/^test\//, /^scripts\//, /^\.github\//, /^\.codegraph\//, /^node_modules\//, /(^|\/)typeset-out\//, /\.tgz$/, /\.tmp$/, /(^|\/)\.DS_Store$/, /\.log$/]
/** 개발 기기의 절대 경로. 글 파일에 남으면 내부 경로가 드러난다. */
const LOCAL_PATHS = [/\/Users\/[A-Za-z0-9._-]+\//, /\/Volumes\/[A-Za-z0-9._-]+\//, /\/home\/[A-Za-z0-9._-]+\//, /[A-Za-z]:\\Users\\/]
const TEXT_FILE = /\.(mjs|js|json|md|txt|svg|html|css)$|^LICENSE$/

/** `npm pack --dry-run --json` 의 결과 → { files: [경로], unpackedSize }. */
function readPackList() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const run = spawnSync(npm, ['pack', '--dry-run', '--json'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' })
  if (run.status !== 0) throw new Error(`npm pack failed:\n${run.stderr}`)
  const [pack] = JSON.parse(run.stdout)
  return { files: pack.files.map((file) => file.path), unpackedSize: pack.unpackedSize }
}

function readDenylist(env) {
  const file = env.TYPESET_KIT_DENYLIST
  if (!file) return []
  // 경로를 줬는데 파일이 없으면 규칙 0개로 통과하지 않고 멈춘다.
  if (!existsSync(file)) throw new Error(`TYPESET_KIT_DENYLIST points to a missing file: ${file}`)
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line, index) => ({ number: index + 1, source: line.trim().normalize('NFC') }))
    .filter((rule) => rule.source && !rule.source.startsWith('#'))
    .map((rule) => ({ number: rule.number, pattern: new RegExp(rule.source, 'i') }))
}

/** 목록에 대한 판정(순수 함수). 문제마다 한 줄이다. */
export function judgePackList({ files, unpackedSize }) {
  const missing = REQUIRED.filter((path) => !files.includes(path)).map((path) => `missing: ${path}`)
  const forbidden = files.filter((path) => FORBIDDEN.some((pattern) => pattern.test(path))).map((path) => `must not be packed: ${path}`)
  const tooBig = unpackedSize > MAX_UNPACKED_BYTES ? [`too big: ${unpackedSize} bytes unpacked, limit ${MAX_UNPACKED_BYTES}`] : []
  return [...missing, ...forbidden, ...tooBig]
}

/** 실리는 글 파일에서 개발 기기 경로와 금지어를 찾는다. 금지어는 낱말을 적지 않고 목록의 줄 번호만 알린다. */
function findExposure(files, denylist) {
  const problems = []
  for (const path of files.filter((file) => TEXT_FILE.test(file))) {
    readFileSync(join(ROOT, path), 'utf8')
      .normalize('NFC')
      .split('\n')
      .forEach((line, index) => {
        if (LOCAL_PATHS.some((pattern) => pattern.test(line))) problems.push(`local path: ${path}:${index + 1}`)
        for (const rule of denylist) if (rule.pattern.test(line)) problems.push(`denylist rule ${rule.number}: ${path}:${index + 1}`)
      })
  }
  return problems
}

const pack = readPackList()
const denylist = readDenylist(process.env)
const problems = [...judgePackList(pack), ...findExposure(pack.files, denylist)]
process.stdout.write(`${pack.files.length} files, ${(pack.unpackedSize / 1024).toFixed(0)} kB unpacked, denylist rules ${denylist.length}\n`)
if (problems.length) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write('pack check ok\n')
