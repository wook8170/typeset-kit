// 원고 안의 로컬 파일 넣기 — 그림 · 글꼴 · 스타일시트를 data 주소와 <style> 로 바꿔 문서 하나로 만든다.
// 부르는 곳: modes/pages.mjs.
// 먼저 읽을 파일: browser/print.mjs(문서를 빈 쪽에 써 넣어서 상대 경로가 열리지 않는 까닭).
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { isInsideRoot, nullIfMissing } from '../../platform.mjs'

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}

const isLocalReference = (reference) => reference !== '' && !/^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(reference)

/** 주소의 % 표기를 푼다. 잘못된 % 표기면 null 이다(그런 이름의 파일은 없다고 본다). */
function decodeReference(reference) {
  try {
    return decodeURI(reference)
  } catch (error) {
    if (!(error instanceof URIError)) throw error
    return null
  }
}

/**
 * 참조가 가리키는 파일을 읽는다. 없으면 scope.missing, 프로젝트 폴더 밖이면 scope.outside 에 적고 null 을 돌려준다.
 * scope = { root, missing, outside }. 폴더 밖 파일은 있는지 보지 않는다.
 */
async function readLocal(reference, baseDir, scope, encoding) {
  const decoded = decodeReference(reference.split(/[?#]/)[0])
  if (decoded === null) {
    scope.missing.push(reference)
    return null
  }
  const file = resolve(baseDir, decoded)
  if (!isInsideRoot(scope.root, file)) {
    scope.outside.push(reference)
    return null
  }
  const content = await nullIfMissing(() => readFile(file, encoding))
  if (content === null) scope.missing.push(reference)
  return content
}

async function toDataUri(reference, baseDir, scope) {
  const mime = MIME[extname(reference.split(/[?#]/)[0]).toLowerCase()]
  if (!mime) {
    scope.missing.push(reference)
    return null
  }
  const bytes = await readLocal(reference, baseDir, scope)
  return bytes ? `data:${mime};base64,${bytes.toString('base64')}` : null
}

/** 정규식에 걸린 참조마다 replacer 를 불러 문자열을 바꾼다(비동기). 못 읽은 참조는 missing 에 모은다. */
async function replaceAsync(text, pattern, replacer) {
  const matches = [...text.matchAll(pattern)]
  const replaced = await Promise.all(matches.map((match) => replacer(...match)))
  let cursor = 0
  let output = ''
  matches.forEach((match, index) => {
    output += text.slice(cursor, match.index) + replaced[index]
    cursor = match.index + match[0].length
  })
  return output + text.slice(cursor)
}

async function inlineCssUrls(css, baseDir, scope) {
  return replaceAsync(css, /url\(\s*(['"]?)([^'")]+)\1\s*\)/g, async (whole, quote, reference) => {
    if (!isLocalReference(reference)) return whole
    const uri = await toDataUri(reference, baseDir, scope)
    return uri ? `url(${uri})` : whole
  })
}

async function inlineStylesheets(html, baseDir, scope) {
  const link = /<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi
  return replaceAsync(html, link, async (tag) => {
    const reference = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1]
    if (!reference || !isLocalReference(reference)) return tag
    const css = await readLocal(reference, baseDir, scope, 'utf8')
    if (css === null) return tag
    return `<style>${await inlineCssUrls(css, dirname(resolve(baseDir, reference)), scope)}</style>`
  })
}

async function inlineImageSources(html, baseDir, scope) {
  return replaceAsync(html, /(\b(?:src|poster)=)(["'])([^"']+)\2/gi, async (whole, attribute, quote, reference) => {
    if (!isLocalReference(reference)) return whole
    const uri = await toDataUri(reference, baseDir, scope)
    return uri ? `${attribute}${quote}${uri}${quote}` : whole
  })
}

/**
 * 원고 파일(baseDir 폴더) 안의 로컬 참조를 문서 안으로 넣는다. 돌려주는 값 = { html, missing, outside }.
 * 대상은 src · poster 속성, <link rel="stylesheet">, CSS 의 url() 이다. 바깥 주소 · data 주소 · 앵커는 건드리지 않는다.
 * 찾지 못한 참조는 그대로 두고 missing 에, 프로젝트 폴더(root) 밖을 가리키는 참조는 읽지 않고 outside 에 모은다.
 */
export async function inlineAssets(html, baseDir, root = baseDir) {
  const scope = { root, missing: [], outside: [] }
  let output = await inlineStylesheets(html, baseDir, scope)
  output = await replaceAsync(output, /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, async (whole, open, css, close) => open + (await inlineCssUrls(css, baseDir, scope)) + close)
  output = await replaceAsync(output, /\bstyle=(["'])([^"']*url\([^"']*)\1/gi, async (whole, quote, css) => `style=${quote}${await inlineCssUrls(css, baseDir, scope)}${quote}`)
  output = await inlineImageSources(output, baseDir, scope)
  return { html: output, missing: [...new Set(scope.missing)], outside: [...new Set(scope.outside)] }
}
