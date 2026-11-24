// Markdown 인라인 렌더 — marked 토큰을 책 명세의 「마크업」 필드에 넣을 인라인 HTML 로 바꾼다.
// 부르는 곳: input/markdown-blocks.mjs(문단 · 목록 · 표 칸 · 콜아웃), input/markdown.mjs(lexer).
// 먼저 읽을 파일: docs/contract.md 「블록」(마크업 필드는 렌더가 그대로 넣는다).
//
// 작성자가 쓴 HTML 은 마크업으로 살리지 않고 글자로 이스케이프한다. 주석(<!-- -->)은 지운다.
// 링크는 http · https · mailto · 문서 안 앵커(#)만 눌리는 링크로 남기고, 나머지는 글자만 남긴다.

import { Marked } from 'marked'

export const escapeText = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const SAFE_LINK = /^(https?:|mailto:|#)/i
/** HTML 주석 한 덩어리인가. */
export const isComment = (text) => /^\s*<!--[\s\S]*-->\s*$/.test(text)

/** 링크 주소가 눌리는 링크로 남아도 되는가(순수 함수). */
export const isSafeHref = (href) => SAFE_LINK.test(String(href ?? '').trim())

/** 글자 하나하나를 HTML 글로 바꾼다. 이미 적힌 문자 참조(&amp; · &#39; 등)는 다시 바꾸지 않는다. marked 의 기본 글 이스케이프와 같은 규칙이다. */
const escapeProse = (value) =>
  String(value).replace(/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, (char) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' })[char])

const renderer = {
  // marked 는 <pre> · <code> · <kbd> · <script> 안의 글에 「이미 이스케이프됨」 표시를 붙이고 기본 렌더러는 그 글을 그대로 낸다.
  // 작성자가 쓴 HTML 은 어느 자리에서든 글자로 보여야 하므로, 그 표시와 관계없이 항상 이스케이프한다.
  text(token) {
    return token.tokens ? this.parser.parseInline(token.tokens) : escapeProse(token.text)
  },
  html(token) {
    return isComment(token.text) ? '' : escapeText(token.text)
  },
  link(token) {
    const label = this.parser.parseInline(token.tokens)
    if (!isSafeHref(token.href)) return label
    const title = token.title ? ` title="${escapeText(token.title)}"` : ''
    return `<a href="${escapeText(token.href.trim())}"${title}>${label}</a>`
  },
  // 문단 안의 그림은 블록이 아니라서 글자(대체 글)만 남긴다. 문단에 그림 하나만 있으면 그림 블록이 된다.
  image(token) {
    return escapeText(token.text)
  },
}

/** 이 도구가 쓰는 marked 한 벌. 전역 marked 설정을 바꾸지 않는다. GFM(표 · 취소선)을 켠다. */
export const markdown = new Marked({ gfm: true, renderer })

/** 인라인 토큰 목록 → 인라인 HTML. 줄바꿈 한 번은 띄어쓰기로 본다. */
export function inlineHtml(tokens) {
  return markdown.Parser.parseInline(tokens ?? [], markdown.defaults).replace(/\n/g, ' ').trim()
}

/** 글 한 줄(Markdown 인라인 문법) → 인라인 HTML. 원고 옆의 자료 파일(개정 이력 등)의 글에 쓴다. 작성자가 쓴 HTML 은 글자로 보인다. */
export function inlineMarkdown(text) {
  return inlineHtml(markdown.Lexer.lexInline(String(text), markdown.defaults))
}

/** 인라인 토큰 목록 → 꾸밈 없는 글(제목 · 대체 글에 쓴다). 렌더가 이스케이프하므로 여기서는 이스케이프하지 않는다. */
export function plainText(tokens) {
  return (tokens ?? [])
    .map((token) => {
      if (token.type === 'html') return ''
      if (token.tokens) return plainText(token.tokens)
      return token.type === 'br' ? ' ' : (token.text ?? '')
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}
