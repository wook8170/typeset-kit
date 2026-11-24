// 그림 넣기 — 책 명세의 그림 파일을 data 주소로 바꾸고, inline SVG 는 글(svgText)로 넣는다. 큰 PNG 는 줄인다.
// 부르는 곳: modes/spec.mjs(렌더 전에, 그림이 파일을 가리킬 때만).
// 먼저 읽을 파일: docs/contract.md 「블록」의 figure, input/image-shrinker.mjs(줄이기).
//
// 조판 문서는 빈 쪽에 써 넣고 내용 보안 정책이 바깥 요청을 막는다. 그래서 그림은 모두 문서 안에 넣어야 보인다.

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { createImageReader } from './image-shrinker.mjs'
import { pngDensity, pngHeader } from './png.mjs'

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' }

const dataUri = (mime, bytes) => `data:${mime};base64,${bytes.toString('base64')}`
const isRemote = (src) => /^[a-z][a-z0-9+.-]*:\/\//i.test(src)

/** 그림 블록이 파일을 가리키는가(순수 함수). data 주소이거나 이미 svgText 가 있으면 넣을 것이 없다. */
export function needsInlining(block) {
  if (block.t !== 'figure' || !block.src || block.src.startsWith('data:')) return false
  return !(block.inline && block.svgText)
}

/** 그림 파일 하나의 판정(순수 함수). 돌려주는 값 = { kind: 'svg' | 'image', mime } 또는 { problem }. */
export function classifyFigure(block) {
  if (isRemote(block.src)) return { problem: `missing-file: ${block.src} is a remote address; save the image next to the manuscript` }
  const mime = MIME[extname(block.src).toLowerCase()]
  if (!mime) return { problem: `missing-file: ${block.src} has an unsupported image type` }
  return { kind: block.inline && mime === MIME['.svg'] ? 'svg' : 'image', mime }
}

/** PNG 의 CSS 크기. 2배 이상으로 찍은 캡처만 정한다(1배는 원래 크기 그대로 실린다). */
function pngPixels(file, bytes) {
  const header = pngHeader(bytes)
  const density = pngDensity(file, header)
  return header && density > 1 ? { w: Math.round(header.width / density), h: Math.round(header.height / density) } : null
}

/** SVG 가 같은 폴더의 그림을 상대 경로로 부르면(<image href="x.png">) data 주소로 바꾼다. 문서에 넣은 SVG 는 원래 폴더를 모른다. */
async function inlineSvgReferences(svg, dir, reader, problems) {
  const references = [...new Set([...svg.matchAll(/<image\b[^>]*?\s(?:xlink:)?href="([^":#]+\.(?:png|jpe?g))"/gi)].map((match) => match[1]))]
  let text = svg
  for (const reference of references) {
    const file = join(dir, reference)
    if (!existsSync(file)) {
      problems.push(`missing-file: ${reference} referenced by an SVG figure`)
      continue
    }
    const mime = MIME[extname(reference).toLowerCase()]
    text = text.split(`href="${reference}"`).join(`href="${dataUri(mime, await reader.load(file))}"`)
  }
  return text
}

async function inlineFigure(block, { root, reader, problems }) {
  const kind = classifyFigure(block)
  const file = kind.problem ? null : resolve(root, block.src)
  const problem = kind.problem ?? (existsSync(file) ? null : `missing-file: ${block.src}`)
  if (problem) {
    problems.push(problem)
    return block
  }
  if (kind.kind === 'svg') {
    const svg = (await readFile(file, 'utf8')).replace(/^﻿?<\?xml[^>]*>\s*/, '').trim()
    const { src, ...rest } = block
    return { ...rest, svgText: await inlineSvgReferences(svg, dirname(file), reader, problems) }
  }
  const original = kind.mime === MIME['.png'] ? await readFile(file) : null
  const px = block.px ?? (original ? pngPixels(file, original) : null)
  return { ...block, src: dataUri(kind.mime, await reader.load(file)), ...(px ? { px } : {}) }
}

async function mapFigures(spec, convert) {
  const chapters = []
  for (const chapter of spec.chapters) {
    const sections = []
    for (const section of chapter.sections) {
      const blocks = []
      for (const block of section.blocks) blocks.push(needsInlining(block) ? await convert(block) : block)
      sections.push({ ...section, blocks })
    }
    chapters.push({ ...chapter, sections })
  }
  return { ...spec, chapters }
}

/**
 * 명세의 그림 파일을 문서 안에 넣은 새 명세를 만든다. options = { root, limits: { imageMaxPx }, cdp }.
 * cdp 가 없으면(인쇄판 HTML · 웹판만 낼 때) 줄이지 않고 넣는다.
 * 돌려주는 값 = { spec, problems } — problems 는 「missing-file: …」 문자열 목록이다. 문제가 있어도 나머지 그림은 넣는다.
 */
export async function inlineSpecImages(spec, { root, limits = {}, cdp = null } = {}) {
  const reader = await createImageReader({ cdp, maxPx: limits.imageMaxPx ?? 0 })
  const problems = []
  try {
    const result = await mapFigures(spec, (block) => inlineFigure(block, { root, reader, problems }))
    return { spec: result, problems }
  } finally {
    await reader.close()
  }
}
