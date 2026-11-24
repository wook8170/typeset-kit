// 원고 파일 찾기 — 문서의 src(경로 또는 글롭 목록)를 파일 목록으로 바꾼다. 글롭은 * ? ** 만 지원한다.
// 부르는 곳: modes/pages.mjs.
// 먼저 읽을 파일: 없음.
import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const hasWildcard = (segment) => /[*?]/.test(segment)

function segmentPattern(segment) {
  const source = segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')
  return new RegExp(`^${source}$`)
}

async function listDirectory(directory) {
  try {
    return await readdir(directory, { withFileTypes: true })
  } catch (error) {
    // 폴더가 없으면 일치하는 파일이 없는 것과 같다. 다른 오류(권한 등)는 그대로 알린다.
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return []
    throw error
  }
}

/** directory 에서 segments 가 나타내는 파일을 모두 찾는다. ** 는 폴더 0 개 이상에 일치한다. */
async function walk(directory, segments) {
  if (segments.length === 0) return []
  const [segment, ...rest] = segments
  const entries = await listDirectory(directory)
  const found = []
  if (segment === '**') {
    found.push(...(await walk(directory, rest)))
    for (const entry of entries.filter((item) => item.isDirectory())) found.push(...(await walk(join(directory, entry.name), segments)))
    return found
  }
  const matcher = segmentPattern(segment)
  for (const entry of entries.filter((item) => matcher.test(item.name))) {
    if (rest.length === 0 && entry.isFile()) found.push(join(directory, entry.name))
    if (rest.length > 0 && entry.isDirectory()) found.push(...(await walk(join(directory, entry.name), rest)))
  }
  return found
}

async function expandOne(pattern, root) {
  const segments = pattern.split('/').filter(Boolean)
  if (!segments.some(hasWildcard)) {
    const path = resolve(root, pattern)
    const info = await stat(path).catch(() => null)
    return info?.isFile() ? [path] : []
  }
  const literal = segments.findIndex(hasWildcard)
  const base = resolve(root, ...segments.slice(0, literal))
  return (await walk(base, segments.slice(literal))).sort((left, right) => left.localeCompare(right, 'en'))
}

/**
 * src 를 파일 목록으로 바꾼다. 돌려주는 값 = { files, missing }. missing 은 일치하는 파일이 없는 항목이다.
 * 같은 파일이 두 번 나오면 한 번만 싣는다. 순서는 src 에 적은 순서이고, 한 글롭 안에서는 이름순이다.
 */
export async function expandSources(src, root) {
  const patterns = Array.isArray(src) ? src : [src]
  const files = []
  const missing = []
  for (const pattern of patterns) {
    const matched = await expandOne(pattern, root)
    if (matched.length === 0) missing.push(pattern)
    for (const file of matched) if (!files.includes(file)) files.push(file)
  }
  return { files, missing }
}
