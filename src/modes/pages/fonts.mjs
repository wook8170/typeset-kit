// 글꼴 준비 — 설정의 글꼴(본문 · 코드)을 문서 안에 넣을 @font-face CSS 와 본문 글꼴 이름으로 바꾼다.
// 부르는 곳: modes/pages.mjs.
// 먼저 읽을 파일: docs/contract.md 「내장 글꼴 표」, src/fonts/css.mjs.
import { fontCss, resolveFontSpec } from '../../fonts/css.mjs'

/** 돌려주는 값 = { css, family }. css 는 @font-face 묶음, family 는 본문 글꼴 스택이다. 글꼴 파일이 없으면 오류를 던진다. */
export function loadFonts(settings, root) {
  const { sans, mono } = settings.theme.fonts
  const css = fontCss([sans, mono], { root })
  const family = resolveFontSpec(sans, { root }).family.replace(/['"\\]/g, '')
  return { css, family: `'${family}', sans-serif` }
}
