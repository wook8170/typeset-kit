// 블록 렌더 — 책 명세의 블록 13종과 절(제목 + 블록)을 흐름 HTML 로 바꾼다.
// 부르는 곳: render/index.mjs(인쇄판 흐름 · renderBody · renderBlock).
// 먼저 읽을 파일: docs/contract.md 「블록」(필드 표, 마크업 필드와 글 필드의 차이).
//
// format = { words, theme, typeset, isLandBook, renderers } 는 render/index.mjs 가 문서마다 한 번 만든다.
// 「마크업」 필드(html · caption · items …)는 작성자가 쓴 인라인 HTML 이라 그대로 넣고, 「글」 필드는 이스케이프한다.

import { contAttr } from './landscape.mjs'
import { contentColWidths, isLandTable, LAND_TABLE_W } from './table-widths.mjs'

export const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 정의 목록의 이름 칸. 이스케이프한 뒤 굵게 · 코드 · 기울임 태그와 이미 적힌 문자 참조만 되살린다. */
const inlineKey = (value) =>
  escapeHtml(value)
    .replace(/&lt;(\/?)(b|strong|code|i|em)&gt;/g, '<$1$2>')
    .replace(/&amp;(lt|gt|amp|quot|#\d+);/g, '&$1;')

/** PDF 책갈피 제목의 번호 · 제목 사이 띄어쓰기. Chrome 은 flex 칸 사이 공백을 버려서 보이지 않을 만큼 작은 공백을 둔다. */
const OUTLINE_SP = '<span class="osp">&nbsp;</span>'

function codeBlock(lines) {
  const body = (Array.isArray(lines) ? lines : String(lines).split('\n')).map(escapeHtml).join('\n')
  return `<pre class="bcode">${body}</pre>`
}

function blockLabel(label) {
  return label ? `<div class="blabel" data-keep="next">${escapeHtml(label)}</div>` : ''
}

function stepsBlock(block) {
  const items = block.items
    .map((item) => {
      if (typeof item === 'string') return `<li>${item}</li>`
      const code = item.code ? `<div class="bcodewrap">${codeBlock(item.code)}</div>` : ''
      const note = item.note ? `<div class="bstepnote">${item.note}</div>` : ''
      return `<li>${item.html}${code}${note}</li>`
    })
    .join('')
  return `${blockLabel(block.label)}<ol class="bsteps"${block.start ? ` start="${block.start}"` : ''}>${items}</ol>`
}

function calloutBlock(block, format) {
  const color = format.theme.callouts[block.kind]
  if (!color) throw new Error(`Unknown callout kind: ${block.kind} (known: ${Object.keys(format.theme.callouts).join(', ')})`)
  const label = format.words.callouts[block.kind] ?? block.kind
  return `<div class="bcallout" style="--co:${color}"><div class="bcokind">${escapeHtml(label)}</div><div class="bcobody">${block.html}</div></div>`
}

function cardsBlock(block) {
  const cards = block.items
    .map(
      (card) =>
        `<div class="bcard"><div class="bcardt">${escapeHtml(card.title)}</div>` +
        `<div class="bcardv">${card.value}</div>` +
        (card.note ? `<div class="bcardn">${card.note}</div>` : '') +
        `</div>`,
    )
    .join('')
  return `${blockLabel(block.label)}<div class="bcards">${cards}</div>`
}

/** 그림마다 고른 자리(typeset.fitFigures). fit = { mode: normal | page | land, w, h }. 가로 책은 모든 쪽이 가로라 표시하지 않는다. */
function figFitAttrs(block, format) {
  if (!format.typeset.fitFigures || !block.fit || !block.svgText) return ''
  const isLandPage = block.fit.mode === 'land' && !format.isLandBook
  return ` data-fit="${escapeHtml(block.fit.mode)}"${isLandPage ? ' data-land="1"' : ''}`
}

/** 그림 본체. marks([{ n, x, y }], x · y 는 그림 폭 · 높이 대비 %)가 있으면 번호 표식을 그림 위에 겹친다. */
function figImage(block) {
  if (block.svgText) {
    const fit = block.fit ? ` style="--fw:${Number(block.fit.w)}px;--fh:${Number(block.fit.h)}px"` : ''
    return `<div class="bfigsvg"${fit}>${block.svgText}</div>`
  }
  // px = 그림의 CSS 픽셀 크기. 폭만 주고, 본문 폭 · 높이 상한은 CSS(max-width · max-height)가 맡는다.
  const css = [block.px?.w ? `width:${Number(block.px.w)}px;object-fit:contain` : '', block.maxh ? `max-height:${Number(block.maxh)}px` : '']
    .filter(Boolean)
    .join(';')
  const img = `<img src="${block.src}" alt="${escapeHtml(block.alt || '')}"${css ? ` style="${css}"` : ''}>`
  if (!block.marks || !block.marks.length) return img
  const marks = block.marks
    .map((mark) => `<span class="bmark" style="left:${Number(mark.x)}%;top:${Number(mark.y)}%">${escapeHtml(mark.n)}</span>`)
    .join('')
  return `<div class="bfigmk">${img}${marks}</div>`
}

function figureBlock(block, format) {
  const number = block.num ? `${format.words.figure} ${escapeHtml(block.num)} · ` : ''
  return (
    `<figure class="bfig"${figFitAttrs(block, format)}>` +
    `<div class="bfigframe${block.svgText ? '' : ' bfigimg'}">${figImage(block)}</div>` +
    `<figcaption class="bfigcap">${number}${block.caption}</figcaption>` +
    `</figure>`
  )
}

function cell(value, tag) {
  if (typeof value === 'string') return `<${tag}>${value}</${tag}>`
  const classes = [value.mono ? 'cmono' : '', value.strong ? 'cstrong' : '', value.align === 'center' ? 'ccenter' : '']
    .filter(Boolean)
    .join(' ')
  return `<${tag}${value.span ? ` colspan="${value.span}"` : ''}${classes ? ` class="${classes}"` : ''}>${value.html}</${tag}>`
}

/** 표 열 폭. 표의 widths 가 먼저고, 없으면 typeset.tableColWidths 가 content 일 때만 내용 길이로 잰다. */
function tableWidths(block, format, isLand) {
  if (block.widths) return block.widths
  const columnCount = block.head ? block.head.length : 0
  if (format.typeset.tableColWidths !== 'content' || block.compact || columnCount <= 1) return null
  return contentColWidths(block.head, block.rows, isLand || format.isLandBook ? { tableWidth: LAND_TABLE_W } : undefined)
}

function tableBlock(block, format) {
  const isLand = isLandTable(block, { mode: format.typeset.landTables, minCols: format.typeset.landTableMinCols })
  const widths = tableWidths(block, format, isLand)
  const cols = widths ? `<colgroup>${widths.map((width) => `<col style="width:${width}">`).join('')}</colgroup>` : ''
  const head = block.head
    ? `<thead><tr>${block.head.map((value) => cell(typeof value === 'string' ? { html: value } : value, 'th')).join('')}</tr></thead>`
    : ''
  const rows = block.rows.map((row) => `<tr>${row.map((value) => cell(value, 'td')).join('')}</tr>`).join('')
  // 가로 표는 표와 캡션 모두 data-land 를 단다. 쪽 나누기 스크립트가 둘을 같은 가로 쪽 묶음에 싣는다.
  const land = isLand ? ' data-land="1"' : ''
  const number = block.num ? `${format.words.table} ${escapeHtml(block.num)} · ` : ''
  const caption = block.caption ? `<div class="btblcap"${land}>${number}${block.caption}</div>` : ''
  // compact = 작은 예시 표. 줄 간격을 줄이고 폭을 열 수에 맞춘다.
  const tableClass = block.compact ? 'btbl bcompact' : 'btbl'
  const tableStyle = block.compact ? ` style="width:${Math.min(100, (block.head ? block.head.length : 2) * 20)}%"` : ''
  const cont = isLand || format.isLandBook ? contAttr(block, format.words, escapeHtml) : ''
  return `<div class="btblwrap"${land}${cont}><table class="${tableClass}"${tableStyle}>${cols}${head}<tbody>${rows}</tbody></table></div>${caption}`
}

/** 블록 종류 → 렌더 함수. 확장 블록은 format.renderers 에서 찾는다. */
const BLOCK_RENDERERS = {
  p: (block) => `<p class="bp">${block.html}</p>`,
  lede: (block) => `<p class="blede">${block.html}</p>`,
  // 제목 요소(h3)를 쓰지 않는다. PDF 책갈피가 h1 ~ h6 을 모두 올려 장 · 절 2단계가 깨지기 때문이다.
  h3: (block) =>
    block.sub
      ? `<div class="bh3" data-keep="next">${escapeHtml(block.text)}<div class="bh3sub">${block.sub}</div></div>`
      : `<div class="bh3" data-keep="next">${escapeHtml(block.text)}</div>`,
  defs: (block) =>
    `<div class="bdefs">${block.rows.map(([key, value]) => `<div class="bdk">${inlineKey(key)}</div><div class="bdv">${value}</div>`).join('')}</div>`,
  steps: stepsBlock,
  ol: stepsBlock,
  ul: (block) => `<ul class="bul">${block.items.map((item) => `<li>${item}</li>`).join('')}</ul>`,
  code: (block) => codeBlock(block.lines),
  table: tableBlock,
  callout: calloutBlock,
  figure: figureBlock,
  cards: cardsBlock,
  sources: (block, format) => `<div class="bsources"><b>${escapeHtml(format.words.sources)}</b> ${block.html}</div>`,
}

/** 블록 하나 → HTML. */
export function renderBlockHtml(block, format) {
  const render = BLOCK_RENDERERS[block.t] ?? format.renderers?.[block.t]
  if (!render) throw new Error(`Unknown block type: ${block.t}`)
  return render(block, format)
}

/** 절 하나(제목 + 블록들). 절 제목 = 책갈피 2단계(role=heading · aria-level 2), id = 차례 링크의 대상. */
export function sectionHtml(section, format) {
  // 영문 보조 표기는 책갈피 제목에서 뺀다(aria-hidden 은 책갈피 글자에서 빠진다).
  const mono = section.mono ? `<span class="bsecmono" aria-hidden="true">${escapeHtml(section.mono)}</span>` : ''
  // 확장 블록(storyboard)으로 시작하는 절은 새 쪽에서 연다.
  const pageBreak = section.blocks[0]?.t === 'storyboard' ? ' data-break="before"' : ''
  const anchor = escapeHtml(section.anchor)
  const head =
    `<div class="bsechead" id="${anchor}" role="heading" aria-level="2" data-keep="next"${pageBreak} data-anchor="${anchor}">` +
    `<span class="bsecno">${escapeHtml(section.no)}${OUTLINE_SP}</span><span class="bsectitle">${escapeHtml(section.title)}</span>${mono}</div>`
  return head + section.blocks.map((block) => renderBlockHtml(block, format)).join('')
}

export { OUTLINE_SP }
