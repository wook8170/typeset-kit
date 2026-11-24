// 내장 글꼴 표 — 설정의 `builtin:<이름>` 이 가리키는 글꼴과 파일. 경로는 패키지의 fonts/ 폴더 기준이다.
// 부르는 곳: doctor/run.mjs(파일이 있는지 점검), fonts/css.mjs(글꼴 CSS 만들기).
// 먼저 읽을 파일: fonts/FONTS.md(파일마다 출처 · 만든 방법), scripts/gen-fonts.py(파일을 다시 만드는 방법).

/** 굵기 400 · 700 두 벌로 고정한 부분 집합이다. 가변 글꼴이 아니라서 Chrome 이 PDF 에 Type 3 로 넣지 않는다. */
export const BUILTIN_FONTS = Object.freeze({
  'noto-sans-kr': Object.freeze({
    family: 'Noto Sans KR',
    files: Object.freeze([
      Object.freeze({ path: 'NotoSansKR-400.woff2', weight: 400, style: 'normal' }),
      Object.freeze({ path: 'NotoSansKR-700.woff2', weight: 700, style: 'normal' }),
    ]),
  }),
  'jetbrains-mono': Object.freeze({
    family: 'JetBrains Mono',
    files: Object.freeze([
      Object.freeze({ path: 'JetBrainsMono-400.woff2', weight: 400, style: 'normal' }),
      Object.freeze({ path: 'JetBrainsMono-700.woff2', weight: 700, style: 'normal' }),
    ]),
  }),
})
