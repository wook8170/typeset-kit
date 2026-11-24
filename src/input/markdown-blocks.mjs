// Markdown 블록 변환 — marked 의 블록 토큰 하나를 책 명세 블록(docs/contract.md 「블록」)으로 바꾼다.
// 부르는 곳: input/markdown.mjs(장 · 절로 나눈 뒤 절 안의 토큰마다 부른다).
// 먼저 읽을 파일: input/markdown-inline.mjs(인라인 HTML · 이스케이프 규칙).

import { posix } from 'node:path'
import { escapeText, inlineHtml, isComment, plainText } from './markdown-inline.mjs'

/** 문단에 그림 하나만 있는가. 있으면 그 그림 토큰, 없으면 null. 앞뒤 공백 글은 무시한다. */
export function soleImage(token) {
  const parts = (token.tokens ?? []).filter((part) => !(part.type === 'text' && !part.text.trim()))
  return parts.length === 1 && parts[0].type === 'image' ? parts[0] : null
}

/** 그림 경로를 root 기준 경로로 바꾼다. 원고 폴더(imageBase, root 기준 / 경로) 기준 상대 경로를 받는다. data 주소 · 바깥 주소는 그대로 둔다. */
export function figureSource(href, imageBase = '') {
  const value = String(href).trim()
  if (/^(data:|[a-z][a-z0-9+.-]*:\/\/)/i.test(value) || posix.isAbsolute(value) || /^[a-z]:[\\/]/i.test(value)) return value
  return posix.normalize(posix.join(imageBase || '.', value))
}

function figureBlock(image, context) {
  const src = figureSource(image.href, context.imageBase)
  const caption = image.title ? escapeText(image.title) : inlineHtml(image.tokens)
  return {
    t: 'figure',
    src,
    caption,
    alt: plainText(image.tokens),
    // SVG 는 문서에 그대로 넣는다. 그래야 내장 글꼴이 그림 안 글자에도 닿는다.
    ...(src.toLowerCase().endsWith('.svg') ? { inline: true } : {}),
  }
}

/** 목록 항목 안의 블록 토큰들 → 인라인 HTML 과 코드. 겹친 목록은 HTML 목록으로 넣는다. */
function itemParts(item) {
  const html = []
  const code = []
  for (const token of item.tokens ?? []) {
    if (token.type === 'code') code.push(token.text)
    else if (token.type === 'list') html.push(nestedListHtml(token))
    else if (token.type === 'text' || token.type === 'paragraph') html.push(inlineHtml(token.tokens ?? [{ type: 'text', text: token.text }]))
    else if (token.type !== 'space') html.push(escapeText(token.raw ?? '').trim())
  }
  return { html: html.filter(Boolean).join(' '), code }
}

/** 목록 항목 하나 → 코드까지 담은 인라인 HTML. 글머리 목록 · 겹친 목록이 쓴다. */
function itemHtml(item) {
  const parts = itemParts(item)
  return parts.html + parts.code.map((lines) => `<pre class="bcode">${escapeText(lines)}</pre>`).join('')
}

function nestedListHtml(list) {
  const tag = list.ordered ? 'ol' : 'ul'
  return `<${tag}>${list.items.map((item) => `<li>${itemHtml(item)}</li>`).join('')}</${tag}>`
}

/** 글머리 목록은 ul, 번호 목록은 ol. 번호 목록 항목의 코드는 항목의 code 칸으로 넣는다(렌더가 항목 아래에 코드 상자를 그린다). */
function listBlock(token) {
  if (!token.ordered) return { t: 'ul', items: token.items.map(itemHtml) }
  const items = token.items.map((item) => {
    const parts = itemParts(item)
    return parts.code.length ? { html: parts.html, code: parts.code.join('\n') } : parts.html
  })
  const start = Number(token.start)
  return { t: 'ol', items, ...(Number.isFinite(start) && start > 1 ? { start } : {}) }
}

function tableCell(cell) {
  const html = inlineHtml(cell.tokens)
  return cell.align === 'center' ? { html, align: 'center' } : html
}

function tableBlock(token) {
  return { t: 'table', head: token.header.map(tableCell), rows: token.rows.map((row) => row.map(tableCell)) }
}

/**
 * 콜아웃 종류 고르기(순수 함수). 인용문 첫 낱말이 굵게 쓴 종류 이름(언어 묶음의 표시 낱말 또는 종류 키)이면 그 종류다.
 * 돌려주는 값 = { kind, rest } — rest 는 종류 낱말을 뗀 나머지 인라인 토큰. 종류 낱말이 없으면 kind 는 null 이다.
 */
export function calloutKind(tokens, kindNames) {
  const [first, ...rest] = tokens ?? []
  if (first?.type !== 'strong') return { kind: null, rest: tokens ?? [] }
  const name = plainText(first.tokens).replace(/[:：]$/, '').toLowerCase()
  const kind = Object.entries(kindNames).find(([key, label]) => key.toLowerCase() === name || String(label).toLowerCase() === name)?.[0]
  if (!kind) return { kind: null, rest: tokens }
  const [next, ...after] = rest
  const trimmed = next?.type === 'text' ? [{ ...next, text: next.text.replace(/^[\s:：—-]+/, '') }, ...after] : rest
  return { kind, rest: trimmed }
}

/** 인용문 → 콜아웃. 종류 낱말이 없으면 note 다. 문단이 여럿이면 줄을 바꿔 잇는다. */
function calloutBlock(token, context) {
  const paragraphs = (token.tokens ?? []).filter((part) => part.type !== 'space')
  const firstTokens = paragraphs[0]?.tokens ?? []
  const { kind, rest } = calloutKind(firstTokens, context.kindNames)
  const bodies = [inlineHtml(rest), ...paragraphs.slice(1).map((part) => (part.tokens ? inlineHtml(part.tokens) : escapeText(part.raw ?? '').trim()))]
  return { t: 'callout', kind: kind ?? 'note', html: bodies.filter(Boolean).join('<br>') }
}

function paragraphBlock(token, context) {
  const image = soleImage(token)
  return image ? figureBlock(image, context) : { t: 'p', html: inlineHtml(token.tokens) }
}

/** 블록 토큰 종류 → 변환 함수. 표에 없는 종류(space · hr · def 등)는 블록을 만들지 않는다. */
const CONVERTERS = {
  paragraph: paragraphBlock,
  heading: (token) => ({ t: 'h3', text: plainText(token.tokens) }),
  code: (token) => ({ t: 'code', lines: token.text.split('\n') }),
  list: listBlock,
  table: tableBlock,
  blockquote: calloutBlock,
  // 원고에 쓴 HTML 블록은 글자로 보인다. 주석은 지운다.
  html: (token) => (isComment(token.text) ? null : { t: 'p', html: escapeText(token.text.trim()) }),
}

/**
 * 블록 토큰 하나 → 책 명세 블록(없으면 null).
 * context = { imageBase, kindNames } — 그림 경로의 기준 폴더, 콜아웃 종류 → 표시 낱말 표.
 */
export function tokenToBlock(token, context) {
  const convert = CONVERTERS[token.type]
  return convert ? convert(token, context) : null
}
