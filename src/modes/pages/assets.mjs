// 원고 안의 로컬 파일 넣기 — 그림 · 글꼴 · 스타일시트를 data 주소와 <style> 로 바꿔 문서 하나로 만든다.
// 부르는 곳: modes/pages.mjs.
// 먼저 읽을 파일: browser/print.mjs(문서를 빈 쪽에 써 넣어서 상대 경로가 열리지 않는 까닭).
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'

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

async function toDataUri(reference, baseDir) {
  const mime = MIME[extname(reference.split(/[?#]/)[0]).toLowerCase()]
  if (!mime) return null
  const bytes = await readFile(resolve(baseDir, decodeURI(reference.split(/[?#]/)[0]))).catch(() => null)
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

async function inlineCssUrls(css, baseDir, missing) {
  return replaceAsync(css, /url\(\s*(['"]?)([^'")]+)\1\s*\)/g, async (whole, quote, reference) => {
    if (!isLocalReference(reference)) return whole
    const uri = await toDataUri(reference, baseDir)
    if (!uri) missing.push(reference)
    return uri ? `url(${uri})` : whole
  })
}

async function inlineStylesheets(html, baseDir, missing) {
  const link = /<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi
  return replaceAsync(html, link, async (tag) => {
    const reference = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1]
    if (!reference || !isLocalReference(reference)) return tag
    const css = await readFile(resolve(baseDir, decodeURI(reference)), 'utf8').catch(() => null)
    if (css === null) {
      missing.push(reference)
      return tag
    }
    return `<style>${await inlineCssUrls(css, dirname(resolve(baseDir, reference)), missing)}</style>`
  })
}

async function inlineImageSources(html, baseDir, missing) {
  return replaceAsync(html, /(\b(?:src|poster)=)(["'])([^"']+)\2/gi, async (whole, attribute, quote, reference) => {
    if (!isLocalReference(reference)) return whole
    const uri = await toDataUri(reference, baseDir)
    if (!uri) missing.push(reference)
    return uri ? `${attribute}${quote}${uri}${quote}` : whole
  })
}

/**
 * 원고 파일(baseDir 폴더) 안의 로컬 참조를 문서 안으로 넣는다. 돌려주는 값 = { html, missing }.
 * 대상은 src · poster 속성, <link rel="stylesheet">, CSS 의 url() 이다. 바깥 주소 · data 주소 · 앵커는 건드리지 않는다.
 * 찾지 못한 참조는 그대로 두고 missing 에 모은다.
 */
export async function inlineAssets(html, baseDir) {
  const missing = []
  let output = await inlineStylesheets(html, baseDir, missing)
  output = await replaceAsync(output, /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, async (whole, open, css, close) => open + (await inlineCssUrls(css, baseDir, missing)) + close)
  output = await replaceAsync(output, /\bstyle=(["'])([^"']*url\([^"']*)\1/gi, async (whole, quote, css) => `style=${quote}${await inlineCssUrls(css, baseDir, missing)}${quote}`)
  output = await inlineImageSources(output, baseDir, missing)
  return { html: output, missing: [...new Set(missing)] }
}
