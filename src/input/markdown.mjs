// Markdown → 책 명세 — 원고를 장(##) · 절(###) · 소제목(####)으로 나누고 블록으로 바꿔 책 명세(docs/contract.md 4절)를 만든다.
// 부르는 곳: modes/book.mjs(원고 파일들을 읽은 뒤), 공개 진입점이 필요하면 이 파일을 직접 가져다 쓴다.
// 먼저 읽을 파일: input/markdown-blocks.mjs(토큰 → 블록), docs/contract.md 「책 명세」.
//
// 규칙
//   - 첫 # 제목이 문서 제목이다. 그 뒤 첫 ## 앞의 문단은 표지 요약(lede)이 된다. 그 자리에 다른 블록이 오면 오류다.
//   - ## 바로 아래 첫 문단은 장 표지 요약(summary)이 된다. ## 와 첫 ### 사이의 나머지 블록은 장 제목을 이름으로 한 절에 담는다.
//   - 장 번호는 1 부터, 절 번호는 「장.절」, 그림 번호는 「장-순번」으로 자동으로 붙인다.

import { tokenToBlock } from './markdown-blocks.mjs'
import { markdown, plainText } from './markdown-inline.mjs'

/** 원고 꼴이 책 명세로 바꿀 수 없을 때의 오류. */
export class MarkdownError extends Error {
  constructor(file, message) {
    super(`${file ? `${file}: ` : ''}${message}`)
    this.name = 'MarkdownError'
  }
}

function startChapter(state, title) {
  const chapter = { title, summary: '', sections: [], isAwaitingSummary: true }
  state.chapters.push(chapter)
  state.section = null
}

function startSection(state, title, file) {
  const chapter = state.chapters.at(-1)
  if (!chapter) throw new MarkdownError(file, `section "${title}" comes before the first chapter heading (##)`)
  chapter.isAwaitingSummary = false
  state.section = { title, blocks: [] }
  chapter.sections.push(state.section)
}

/** 장 머리와 첫 절 사이의 블록. 첫 문단은 장 요약, 나머지는 장 제목을 이름으로 한 절에 담는다. */
function addChapterLead(chapter, block, state) {
  if (chapter.isAwaitingSummary && block.t === 'p' && !chapter.summary) {
    chapter.summary = block.html
    chapter.isAwaitingSummary = false
    return
  }
  chapter.isAwaitingSummary = false
  state.section = { title: chapter.title, blocks: [block] }
  chapter.sections.push(state.section)
}

function addBlock(state, block, file) {
  const chapter = state.chapters.at(-1)
  if (!chapter) {
    if (block.t !== 'p') throw new MarkdownError(file, `only paragraphs may come before the first chapter heading (##), found ${block.t}`)
    state.lede.push(block.html)
    return
  }
  if (state.section) state.section.blocks.push(block)
  else addChapterLead(chapter, block, state)
}

function addHeading(state, token, file) {
  const title = plainText(token.tokens)
  if (token.depth === 1 && state.title === null && state.chapters.length === 0) state.title = title
  else if (token.depth <= 2) startChapter(state, title)
  else if (token.depth === 3) startSection(state, title, file)
  else if (state.section || state.chapters.length) addBlock(state, { t: 'h3', text: title }, file)
  else throw new MarkdownError(file, `heading "${title}" comes before the first chapter heading (##)`)
}

/**
 * 원고 한 편 → 번호를 붙이기 전의 조각 { title, lede, chapters }.
 * options = { file, imageBase, kindNames } — 오류에 적을 파일 이름, 그림 경로의 기준 폴더(root 기준 / 경로), 콜아웃 종류 → 표시 낱말.
 */
export function parseMarkdown(text, { file = '', imageBase = '', kindNames = {} } = {}) {
  const state = { title: null, lede: [], chapters: [], section: null }
  const context = { imageBase, kindNames }
  for (const token of markdown.lexer(String(text))) {
    if (token.type === 'heading') {
      addHeading(state, token, file)
      continue
    }
    const block = tokenToBlock(token, context)
    if (block) addBlock(state, block, file)
  }
  const chapters = state.chapters.map(({ isAwaitingSummary, ...chapter }) => chapter)
  return { title: state.title, lede: state.lede.join('<br>'), chapters }
}

function numberSection(section, chapterNo, sectionIndex, figureCounter) {
  const blocks = section.blocks.map((block) => (block.t === 'figure' && !block.num ? { ...block, num: `${chapterNo}-${figureCounter.next()}` } : block))
  return { no: `${chapterNo}.${sectionIndex + 1}`, title: section.title, blocks }
}

/** 장 · 절 · 그림에 번호를 붙인다(순수 함수). 그림 번호는 장마다 1 부터 센다. */
export function numberChapters(chapters) {
  return chapters.map((chapter, chapterIndex) => {
    const no = String(chapterIndex + 1)
    let figures = 0
    const figureCounter = { next: () => ++figures }
    return {
      no,
      title: chapter.title,
      ...(chapter.summary ? { summary: chapter.summary } : {}),
      sections: chapter.sections.map((section, sectionIndex) => numberSection(section, no, sectionIndex, figureCounter)),
    }
  })
}

/**
 * 원고 조각들을 한 권으로 합친다(순수 함수). 제목은 첫 # 제목, 없으면 options.title 이다.
 * options = { title, docInfo, subtitle, file } — docInfo 는 개정 이력 등(계약 4.1절), file 은 오류에 적을 이름.
 */
export function mergeParts(parts, { title = '', docInfo, subtitle, file = '' } = {}) {
  const specTitle = parts.find((part) => part.title)?.title ?? title
  if (!specTitle) throw new MarkdownError(file, 'no document title: add a "# title" line or set documents[].title')
  const lede = parts.map((part) => part.lede).filter(Boolean).join('<br>')
  return {
    title: specTitle,
    ...(subtitle ? { subtitle } : {}),
    ...(lede ? { lede } : {}),
    ...(docInfo ? { docInfo } : {}),
    chapters: numberChapters(parts.flatMap((part) => part.chapters)),
  }
}

/** Markdown 글 하나 → 책 명세. options 는 parseMarkdown 과 mergeParts 의 옵션을 합친 것이다. */
export function markdownToSpec(text, options = {}) {
  return mergeParts([parseMarkdown(text, options)], options)
}
