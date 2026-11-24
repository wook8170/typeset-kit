// 글롭 펼치기 — `*` · `**` · `?` 만 쓰는 작은 경로 패턴을 root 아래 파일 목록으로 바꾼다.
// 부르는 곳: writing/targets.mjs. 경로는 항상 `/` 로 나눈 root 기준 상대 경로다.
// 먼저 읽을 파일: 없음.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const SKIPPED_FOLDERS = new Set(['node_modules', '.git'])
const GLOB_CHARS = /[*?]/

export const isGlob = (pattern) => GLOB_CHARS.test(pattern)

/** 패턴 → 정규식. `**` 는 폴더 경계를 넘고, `*` 와 `?` 는 폴더 안에서만 맞는다. */
export function globToRegExp(pattern) {
  let source = ''
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*' && pattern[index + 1] === '*') {
      const hasSlash = pattern[index + 2] === '/'
      source += hasSlash ? '(?:.*/)?' : '.*'
      index += hasSlash ? 2 : 1
    } else if (char === '*') source += '[^/]*'
    else if (char === '?') source += '[^/]'
    else source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${source}$`)
}

function listFiles(root, folder = '') {
  const found = []
  for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
    const relative = folder ? `${folder}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name)) found.push(...listFiles(root, relative))
    } else found.push(relative)
  }
  return found
}

/** 패턴에 맞는 파일(정렬된 상대 경로). 패턴 앞쪽의 글롭 없는 폴더에서만 훑는다. */
export function expandGlob(root, pattern) {
  const literalParts = []
  for (const part of pattern.split('/')) {
    if (isGlob(part)) break
    literalParts.push(part)
  }
  const base = literalParts.slice(0, -1).join('/')
  let candidates
  try {
    candidates = listFiles(root, base)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  const matcher = globToRegExp(pattern)
  return candidates.filter((file) => matcher.test(file)).sort()
}
