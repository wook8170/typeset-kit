// 표 판정 — 내용 길이에 비례한 열 폭과, 표를 가로 쪽에 실을지의 판정. 모두 순수 함수다.
// 부르는 곳: render/blocks.mjs(표 블록), 공개 진입점 `typeset-kit/render`.
// 먼저 읽을 파일: 아래 contentColWidths 의 설명(열마다 재는 세 폭).

import { PAGE_LAND } from '../theme/index.mjs'

/** 세로 쪽 표 폭(px)의 어림값. 열 폭 비율을 잴 때만 쓴다. */
export const TABLE_W = 666
/** 가로 쪽 표 본문 폭(px) = A4 가로 1123px − 좌우 여백 48px × 2. */
export const LAND_TABLE_W = PAGE_LAND.pxW - 2 * PAGE_LAND.side

/** 글자 단위 1 의 폭(px)과 칸 안 여백(px). 칸 폭은 이 두 값으로 어림한다. */
const UNIT_PX = 7
const CELL_PADDING_PX = 22
/** 한 줄에 넣으려는 낱말 길이 상한과, 바라는 폭을 잴 때 쓰는 긴 칸 길이 상한(글자 단위). */
const WORD_CAP = 36
const LONG_CAP = 80

/** 칸 글자의 대략적인 표시 폭(라틴 1, 한글 · 한자 1.8). 태그는 빼고 문자 참조는 한 글자로 센다. */
export function textWidth(html) {
  const plain = String(html).replace(/<[^>]*>/g, '').replace(/&[#\w]+;/g, '·')
  let width = 0
  for (const char of plain) width += char.codePointAt(0) >= 0x1100 ? 1.8 : 1
  return width
}

const sum = (values) => values.reduce((total, value) => total + value, 0)
const toPx = (units) => units * UNIT_PX + CELL_PADDING_PX
const cellHtml = (cell) => (typeof cell === 'string' ? cell : cell && !cell.span ? cell.html : null)
const wordsOf = (html) => String(html).replace(/<[^>]*>/g, ' ').split(/\s+/)
const plainText = (html) => String(html).replace(/<[^>]*>/g, '').trim()
const isNumberish = (text) => /^[\d.,%:~\-–+\s]*$/.test(text)

/**
 * 열 하나를 잰다. 돌려주는 값 = { hard, soft, need, want, isLabel }(폭은 px).
 *   - hard(단단한 최소 폭) = 가장 긴 낱말(36자 상한)이 한 줄에 들어가는 폭과 표 폭의 min 비율 중 큰 값
 *   - soft(무른 최소 폭) = 짧은 칸(short 단위 이하)이 한 줄에 들어가는 폭. hard 보다 작지 않다
 *   - need(필요 폭) = 가장 긴 칸이 한 줄에 들어가는 폭. 어떤 열도 이보다 넓게 주지 않는다
 *   - want(바라는 폭) = 평균 칸 폭 × 0.6 + 가장 긴 칸 폭(80자 상한) × 0.4
 *   - isLabel = 칸이 모두 짧은 글이고 숫자만으로 된 열이 아니다
 * 여러 열을 합친 칸(span)과 칸 수가 다른 행은 재지 않는다. 머리글은 본문보다 작은 글자라 0.9 배로 잰다.
 */
function measureColumn({ head, rows, index, columnCount, limits }) {
  const headHtml = head && head[index] != null ? cellHtml(head[index]) ?? '' : ''
  const headWidth = textWidth(headHtml) * 0.9
  let longestWord = Math.max(0, ...wordsOf(headHtml).map(textWidth)) * 0.9
  let shortMax = headWidth <= limits.short ? headWidth : 0
  const widths = []
  const texts = []
  for (const row of rows) {
    const html = row.length === columnCount ? cellHtml(row[index]) : null
    if (html == null) continue
    const width = textWidth(html)
    widths.push(width)
    texts.push(plainText(html))
    if (width <= limits.short) shortMax = Math.max(shortMax, width)
    for (const word of wordsOf(html)) longestWord = Math.max(longestWord, textWidth(word))
  }
  const average = widths.length ? sum(widths) / widths.length : 0
  const longest = widths.length ? Math.max(...widths) : 0
  const hard = Math.max(toPx(Math.min(longestWord, WORD_CAP)), limits.tableWidth * limits.min)
  const soft = Math.max(hard, toPx(shortMax))
  return {
    hard,
    soft,
    need: Math.max(soft, toPx(Math.max(longest, headWidth))),
    want: Math.max(soft, toPx(average * 0.6 + Math.min(longest, LONG_CAP) * 0.4)),
    isLabel: widths.length > 0 && longest <= limits.short && texts.some((text) => !isNumberish(text)),
  }
}

/** 낱말이 모두 한 줄에 들어갈 수 없을 때. 가장 넓은 열부터 같은 높이로 깎고, 그래도 모자라면 같은 폭으로 나눈다. */
function shrinkToFit(hard, tableWidth, min) {
  const floor = tableWidth * min
  const cut = (level) => sum(hard.map((width) => Math.max(floor, Math.min(width, level))))
  if (cut(floor) >= tableWidth) return hard.map(() => tableWidth / hard.length)
  let low = floor
  let high = Math.max(...hard)
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2
    if (cut(middle) > tableWidth) high = middle
    else low = middle
  }
  const widths = hard.map((width) => Math.max(floor, Math.min(width, low)))
  const total = sum(widths)
  return widths.map((width) => (width / total) * tableWidth)
}

/** 무른 최소 폭까지 다 채울 수 없을 때. 단단한 최소 폭과 무른 최소 폭 사이를 같은 비율로 채운다. */
function blendToSoft(columns, tableWidth) {
  const sumHard = sum(columns.map((column) => column.hard))
  const sumSoft = sum(columns.map((column) => column.soft))
  const ratio = (tableWidth - sumHard) / (sumSoft - sumHard)
  return columns.map((column) => column.hard + (column.soft - column.hard) * ratio)
}

/** 무른 최소 폭을 다 채우고 남을 때. 필요 폭에 닿지 않은 열에 바라는 폭 비율대로 나눈다(물 채우기). */
function fillToNeed(columns, tableWidth) {
  let widths = columns.map((column) => column.soft)
  let extra = tableWidth - sum(widths)
  for (let pass = 0; pass <= columns.length && extra > 0.01; pass++) {
    const isOpen = widths.map((width, i) => columns[i].need - width > 0.01)
    if (!isOpen.some(Boolean)) break
    let weights = widths.map((width, i) => (isOpen[i] ? Math.max(0, columns[i].want - columns[i].soft) : 0))
    if (sum(weights) <= 0) weights = widths.map((width, i) => (isOpen[i] ? columns[i].need - width : 0))
    const totalWeight = sum(weights)
    let given = 0
    widths = widths.map((width, i) => {
      if (!isOpen[i]) return width
      const add = Math.min(columns[i].need - width, (weights[i] / totalWeight) * extra)
      given += add
      return width + add
    })
    extra -= given
  }
  // 모든 열이 필요 폭에 닿고도 남으면 지금 폭 비율대로 늘린다.
  if (extra > 0.01) {
    const total = sum(widths)
    widths = widths.map((width) => width + (width / total) * extra)
  }
  return widths
}

/**
 * 내용 길이에 비례한 열 폭(% 문자열 목록). 표에 `widths` 가 없고 typeset.tableColWidths 가 content 일 때 쓴다.
 * 배분: 단단한 최소 폭 합이 표 폭을 넘으면 shrinkToFit, 무른 최소 폭까지 못 채우면 blendToSoft, 다 채우면 fillToNeed.
 * 두 칸 라벨 · 값 표(첫 열이 모두 짧은 글)는 라벨 열을 label 범위(18 ~ 28%)에 둔다.
 */
export function contentColWidths(head, rows, { min = 0.06, short = 24, label = [0.18, 0.28], tableWidth = TABLE_W } = {}) {
  const columnCount = head ? head.length : rows.reduce((most, row) => Math.max(most, row.length), 0)
  const limits = { min, short, tableWidth }
  const columns = Array.from({ length: columnCount }, (_, index) => measureColumn({ head, rows, index, columnCount, limits }))
  const sumHard = sum(columns.map((column) => column.hard))
  const sumSoft = sum(columns.map((column) => column.soft))
  let widths
  if (sumHard >= tableWidth) widths = shrinkToFit(columns.map((column) => column.hard), tableWidth, min)
  else if (sumSoft >= tableWidth) widths = blendToSoft(columns, tableWidth)
  else widths = fillToNeed(columns, tableWidth)
  if (columnCount === 2 && columns[0].isLabel && !columns[1].isLabel) {
    const low = label[0] * tableWidth
    const high = Math.max(label[1] * tableWidth, columns[0].hard)
    const first = Math.min(Math.max(widths[0], low), high, tableWidth - columns[1].hard)
    widths = [first, tableWidth - first]
  }
  return widths.map((width) => `${((width / tableWidth) * 100).toFixed(1)}%`)
}

/**
 * 표를 가로 쪽에 실을지 정한다. rule = { mode: 'off' | 'auto', minCols }.
 * 표에 `land`(true · false)가 있으면 그 값이 먼저다. auto 면 전체 열이 minCols 개 이상일 때 가로다.
 * mode 가 off 이거나 작은 예시 표(compact)는 늘 세로다.
 */
export function isLandTable(block, { mode = 'off', minCols = 8 } = {}) {
  if (mode !== 'auto' || block.compact) return false
  if (block.land === true || block.land === false) return block.land
  const columns = block.head ? block.head.length : block.rows.reduce((most, row) => Math.max(most, row.length), 0)
  return columns >= minCols
}
