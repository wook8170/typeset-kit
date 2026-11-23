// 공개 진입점 `typeset-kit/pdf-nav` — PDF 후처리(탐색 정보 쓰기 · 합치기)와 읽기를 내보낸다.
// 부르는 곳: 패키지 사용자, 조판 모드(modes/*), check/index.mjs.
// 먼저 읽을 파일: pdf/nav.mjs(쓰기), pdf/inspect.mjs(읽기), pdf/merge.mjs(합치기).
export { applyPdfNav, applyPdfNavBytes } from './nav.mjs'
export { mergePdfs } from './merge.mjs'
export { inspectPdf } from './inspect.mjs'
