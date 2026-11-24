// 기본 테마(light-cover) — 조판 문서의 색 · 글꼴 스택 · 쪽 규격 값과, 설정 값으로 테마 한 벌을 만드는 defineTheme.
// 부르는 곳: render/*(쪽 크롬 · 문서 CSS · 블록), modes/spec.mjs(설정 → 테마), 공개 진입점 `typeset-kit/theme`.
// 먼저 읽을 파일: docs/contract.md 「설정 계약」의 theme 키.

export const INK = '#1b1f27'
export const INK2 = '#4b5361'
export const INK3 = '#7a8290'
export const LINE = '#d9dce3'
export const LINE2 = '#eceef2'
export const PAPER = '#ffffff'
export const SURF = '#f4f5f8'

export const DEFAULT_SANS_FAMILY = 'Noto Sans KR'
export const DEFAULT_MONO_FAMILY = 'JetBrains Mono'

/** 본문 글꼴 스택. 내장 글꼴이 준비되기 전 · 빠진 글자에 쓰일 대체 글꼴을 뒤에 둔다. */
export const SANS = `'Noto Sans KR','Apple SD Gothic Neo',sans-serif`
/**
 * 코드 글꼴 스택. 코드 안의 한글까지 내장 글꼴로 덮으려고 본문 글꼴을 둘째에 둔다.
 * 빠지면 시스템 글꼴로 떨어져 PDF 에 내장되지 않은 글꼴이 섞인다.
 */
export const MONO = `'JetBrains Mono','Noto Sans KR',ui-monospace,Menlo,monospace`

/** 기본 콜아웃 세 종류의 색. 표시 낱말은 언어 묶음(render/locale)에서 온다. */
export const CALLOUT_COLORS = Object.freeze({
  note: INK3,
  caution: 'oklch(0.53 0.13 70)',
  warning: 'oklch(0.54 0.17 25)',
})

/** A4 세로 쪽 규격. 길이는 CSS 픽셀(96dpi)이다. top · bottom 은 본문 자리의 위 · 아래 여백이다. */
export const PAGE = Object.freeze({
  width: '210mm',
  height: '297mm',
  pxW: 794,
  left: 64,
  right: 56,
  top: 76,
  bottom: 72,
  headTop: 36,
  footBottom: 36,
})

/** A4 가로 쪽 규격. 위아래 여백과 머리글 · 꼬리글 자리는 PAGE 와 같다. 본문은 1027 × 646px 이다. */
export const PAGE_LAND = Object.freeze({ width: '297mm', height: '210mm', pxW: 1123, side: 48 })

/** 문서 색. 채도 · 명도를 고정하고 색상 각만 바꾼다. 그래서 어느 색상 각이든 흰 바탕에서 읽히는 진하기가 된다. */
export function hueColor(hue) {
  return `oklch(0.52 0.09 ${Number(hue)})`
}

/** 글꼴 이름 하나를 CSS 이름으로. 따옴표 · 역빗금은 지워 CSS 를 깨지 않게 한다. */
const quoteFamily = (family) => `'${String(family).replace(/['"\\]/g, '')}'`

/** 본문 · 코드 글꼴 이름 → 글꼴 스택. 기본 이름이면 SANS · MONO 와 한 글자도 다르지 않다. */
export function fontStacks({ sans = DEFAULT_SANS_FAMILY, mono = DEFAULT_MONO_FAMILY } = {}) {
  const sansName = quoteFamily(sans)
  return {
    sans: sans === DEFAULT_SANS_FAMILY ? SANS : `${sansName},sans-serif`,
    mono: `${quoteFamily(mono)},${sansName},ui-monospace,Menlo,monospace`,
  }
}

/**
 * 테마 한 벌을 만든다(순수 함수).
 * input = { hue, families: { sans, mono }, callouts: { 종류: CSS 색 } }. 빠진 값은 기본 테마 값이다.
 * 돌려주는 값 = { hue, accent, sans, mono, callouts, page, pageLand }. accent 는 문서 색이다.
 */
export function defineTheme({ hue = 250, families = {}, callouts = {} } = {}) {
  const { sans, mono } = fontStacks(families)
  return {
    hue,
    accent: hueColor(hue),
    sans,
    mono,
    callouts: { ...CALLOUT_COLORS, ...callouts },
    page: PAGE,
    pageLand: PAGE_LAND,
  }
}
