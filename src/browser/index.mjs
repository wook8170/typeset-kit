// 공개 진입점 `typeset-kit/browser` — 브라우저 찾기 · 띄우기 · 문서 넣기 · PDF 굽기를 내보낸다.
// 부르는 곳: 패키지 사용자, 조판 모드(modes/*).
// 먼저 읽을 파일: browser/chrome.mjs, browser/print.mjs.
export { withChrome, chromeArgs, browserVersion, LAUNCH_TIMEOUT_MS } from './chrome.mjs'
export { openDocument, printPdf, waitDeadline, PRINT_PARAMS, WRITE_CHUNK } from './print.mjs'
export { findBrowser, browserCandidates, BrowserNotFoundError, INSTALL_HINT } from './find.mjs'
export { connectCdp, CdpError } from './cdp.mjs'
