// 렌더 — 책 명세를 인쇄판 조판 HTML(표지 + 흐름 블록 + 쪽 나누기 스크립트 + 내용 보안 정책)로, 또는 본문 HTML 로 바꾼다.
// 부르는 곳: modes/spec.mjs(인쇄판), 웹판 만들기(web/*, renderBody), 공개 진입점 `typeset-kit/render`.
// 먼저 읽을 파일: docs/contract.md 「블록 계약」 · 「문서 설정」, render/blocks.mjs(블록 → HTML).
//
// options = { settings, fontCss, logoSvg, theme, words, renderers, paginator, extraCss }
//   - settings: documentSettings() 의 결과(필수). locale · brand · theme · cover · header · footer · typeset 을 읽는다.
//   - fontCss: @font-face CSS. logoSvg: 표지 마크 SVG 글(검사를 거친 것).
//   - theme: defineTheme() 의 결과. 없으면 명세 hue → settings.theme 으로 만든다.
//   - words: 낱말 덮어쓰기. renderers · paginator · extraCss: 확장 블록의 렌더 함수 · 쪽 나누기 선택 사항 · CSS.

import { assignAnchors } from '../spec/contract.mjs'
import { defineTheme } from '../theme/index.mjs'
import { escapeHtml, OUTLINE_SP, renderBlockHtml, sectionHtml } from './blocks.mjs'
import { cspMeta } from './csp.mjs'
import { chapterOpenerHtml, coverHtml, deriveIssue, docInfoHtml, tocHtml } from './front.mjs'
import { isLandBook } from './landscape.mjs'
import { localeWords } from './locale/index.mjs'
import { paginatorScript } from './paginator.mjs'
import { RUNNING_PAGINATOR_OPTIONS, runningSlots } from './running.mjs'
import { documentCss } from './styles.mjs'

/** 렌더 함수들이 함께 쓰는 문서 단위 값. 문서마다 한 번 만든다. */
function documentFormat(spec, options) {
  const { settings } = options
  if (!settings) throw new Error('render options.settings is required (use documentSettings())')
  const theme = options.theme ?? defineTheme({ hue: spec.hue ?? settings.theme.hue, callouts: settings.theme.callouts })
  return {
    words: localeWords(settings.locale, options.words),
    theme,
    typeset: settings.typeset,
    isLandBook: isLandBook(settings),
    renderers: options.renderers ?? {},
  }
}

/** 쪽 나누기 선택 사항. 쪽 크롬은 늘 설정의 머리글 · 꼬리글로 짜고, 나머지는 설정이 켠 것만 켠다. */
function paginatorOptions(format, extra = {}) {
  const { typeset, isLandBook: isLand } = format
  const hasLandTables = typeset.landTables === 'auto'
  return {
    ...RUNNING_PAGINATOR_OPTIONS,
    ...(typeset.tableFillSplit > 0 ? { fillSplitRows: typeset.tableFillSplit } : {}),
    ...(hasLandTables || isLand ? { contMark: true } : {}),
    ...(typeset.splitSectionList ? { splitSectionList: true } : {}),
    // 가로 쪽 블록(data-land)은 세로 책에만 있다. 책 전체가 가로면 쪽마다 같은 크기라 가로 쪽 처리를 켜지 않는다.
    ...((typeset.fitFigures || hasLandTables) && !isLand ? { landscape: true } : {}),
    ...extra,
  }
}

/** <script> 안에 넣는 JSON. 「</script>」 같은 글이 스크립트를 닫지 못하게 꺾쇠를 이스케이프한다. */
const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c')

/** 흐름 블록 — 문서 정보(있으면) · 차례 · 장 표지와 절들. */
function flowHtml(spec, format) {
  const flow = []
  if (spec.docInfo) flow.push(docInfoHtml(spec.docInfo, format.words))
  flow.push(tocHtml(spec, format.words))
  const opener = { words: format.words, outlineSpace: OUTLINE_SP, sectionListMax: format.typeset.sectionListMax }
  for (const chapter of spec.chapters) {
    flow.push(chapterOpenerHtml(chapter, opener))
    for (const section of chapter.sections) flow.push(sectionHtml(section, format))
  }
  return flow.join('')
}

/** 인쇄판 조판 HTML 한 벌(문자열). 브라우저에 넣으면 쪽 나누기 스크립트가 쪽을 짜고 창 변수로 결과를 알린다. */
export function renderPrintHtml(sourceSpec, options) {
  const spec = assignAnchors(sourceSpec)
  const format = documentFormat(spec, options)
  const { settings } = options
  const issue = deriveIssue(spec.docInfo?.revisions)
  const pageMeta = {
    running: runningSlots(settings),
    values: { title: spec.title, brand: settings.brand.name, edition: issue.month },
  }
  const meta = `window.__PAGE_META__=${scriptJson(pageMeta)};`
  const pager = paginatorScript(paginatorOptions(format, options.paginator))
  const css = documentCss(format, settings, options.extraCss)
  const cover = coverHtml({ spec, settings, words: format.words, issue, logoSvg: options.logoSvg ?? '' })
  const title = [settings.brand.name, spec.title].filter(Boolean).map(escapeHtml).join(' ')
  return `<!doctype html>
<html lang="${format.words.lang}"><head><meta charset="utf-8">${cspMeta([meta, pager])}<title>${title}</title>
<style>${options.fontCss ?? ''}</style>
<style>${css}</style>
</head><body>
<div id="book">${cover}</div>
<div id="flow" aria-hidden="true">${flowHtml(spec, format)}</div>
<script>${meta}</script>
<script>${pager}</script>
</body></html>`
}

/**
 * 본문 HTML(문자열) — 장마다 장 머리(id = 장 앵커, 책갈피 1단계 표시)와 절들. 쪽 크롬 · 표지 · 차례 · 스크립트가 없다.
 * 웹판처럼 쪽을 나누지 않는 출력이 쓴다. 장 머리 꼴: <div class="bchapter" id="ch0" role="heading" aria-level="1">.
 */
export function renderBody(sourceSpec, options) {
  const spec = assignAnchors(sourceSpec)
  const format = documentFormat(spec, options)
  return spec.chapters
    .map((chapter) => {
      const number = escapeHtml(chapter.label || chapter.no)
      const head =
        `<div class="bchapter" id="${escapeHtml(chapter.anchor)}" role="heading" aria-level="1">` +
        `<span class="bchno">${number}</span>${OUTLINE_SP}<span class="bchtitle">${escapeHtml(chapter.title)}</span></div>` +
        (chapter.summary ? `<p class="blede">${chapter.summary}</p>` : '')
      return head + chapter.sections.map((section) => sectionHtml(section, format)).join('')
    })
    .join('')
}

/** 블록 하나 → HTML. 확장 블록은 options.renderers 의 같은 이름 함수가 그린다. */
export function renderBlock(block, options) {
  return renderBlockHtml(block, documentFormat({}, options))
}

export { deriveIssue } from './front.mjs'
export { contentColWidths, isLandTable, LAND_TABLE_W, textWidth } from './table-widths.mjs'
export { assertSafeSvg, svgAllowList, svgProblem, SVG_ATTRS, SVG_ELEMENTS } from './svg-guard.mjs'
export { cspMeta, cspPolicy, scriptHash } from './csp.mjs'
export { localeWords, LOCALE_WORDS } from './locale/index.mjs'
export { fillRunning, parseRunning } from './running.mjs'
