// 원고 다듬기 — 자리표시자 채우기, 쪽 제목 읽기, 굽기 준비 스크립트와 글꼴 CSS 넣기.
// 부르는 곳: modes/pages.mjs.
// 먼저 읽을 파일: docs/contract.md 「쪽 나누기 스크립트가 알리는 값」(__paged 를 기다리는 쪽).

const VARIABLE = /\{\{\s*([^{}\s]+)\s*\}\}/g

/** 원고의 {{이름}} 을 vars 로 채운다. 돌려주는 값 = { html, missing }. vars 에 없는 이름은 그대로 두고 missing 에 모은다. */
export function fillVars(html, vars = {}) {
  const missing = new Set()
  const filled = html.replace(VARIABLE, (whole, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key]
    missing.add(key)
    return whole
  })
  return { html: filled, missing: [...missing] }
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }

/** 원고의 <title> 글. 없으면 빈 문자열. */
export function pageTitle(html) {
  const raw = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ''
  return raw.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity]).replace(/\s+/g, ' ').trim()
}

export const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 쪽 나누기 스크립트가 없는 원고도 printPdf 가 기다릴 수 있도록, 글꼴이 준비되면 __paged 를 세우는 스크립트. */
export const READY_SCRIPT = '<script>document.fonts.ready.then(function(){window.__paged=true})</script>'

function insertBefore(html, closingTag, text) {
  const index = html.toLowerCase().lastIndexOf(closingTag)
  return index < 0 ? html + text : html.slice(0, index) + text + html.slice(index)
}

/** 글꼴 CSS 를 <head> 끝에, 준비 스크립트를 <body> 끝에 넣는다. */
export function preparePage(html, { fontCss = '' } = {}) {
  const withFonts = fontCss ? insertBefore(html, '</head>', `<style>${fontCss}</style>`) : html
  return insertBefore(withFonts, '</body>', READY_SCRIPT)
}
