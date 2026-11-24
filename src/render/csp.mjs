// 조판 문서의 내용 보안 정책 — 렌더가 넣은 인라인 스크립트 두 개(쪽 정보 · 쪽 나누기)만 돌고 나머지는 막히게 한다.
// 부르는 곳: render/index.mjs(문서 머리에 <meta> 로 넣는다).
// 먼저 읽을 파일: render/svg-guard.mjs(그대로 넣는 그림을 따로 검사한다).
//
// 조판 브라우저는 문서에 그대로 넣은 그림(SVG)도 문서의 일부로 해석한다. 그래서 정책을 둔다.
//   - default-src 'none' — 프레임 · 개체 · 외부 연결 · 미디어 · 작업자를 막는다.
//   - script-src — 그 문서의 두 스크립트 해시만. 스크립트는 문서마다 내용이 달라서 렌더가 HTML 을 만들 때 계산한다.
//     이벤트 속성과 다른 인라인 스크립트는 막힌다.
//   - style-src 'unsafe-inline' — 문서가 style 속성과 <style> 을 쓴다. 스타일이 부르는 바깥 자원은 img-src · font-src 가 묶는다.
//   - img-src · font-src data: — 그림과 글꼴은 data 주소로 들어간다.
//   - base-uri · form-action 'none' — default-src 를 따르지 않는 두 항목이라 따로 막는다.
// CDP 로 넣는 식(Runtime.evaluate)은 문서 정책을 받지 않는다. 그래서 printPdf 의 문서 넣기와 대기는 막히지 않는다.

import { createHash } from 'node:crypto'

/** 인라인 스크립트 본문의 정책 해시(`'sha256-…'`). 본문은 <script> 와 </script> 사이 문자열 그대로다. */
export function scriptHash(body) {
  return `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`
}

/** 스크립트 본문 목록 → 정책 문자열. */
export function cspPolicy(scripts) {
  if (!scripts.length) throw new Error('A content security policy needs at least one script')
  return [
    "default-src 'none'",
    `script-src ${scripts.map(scriptHash).join(' ')}`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    'font-src data:',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}

/** 문서 머리에 넣을 <meta> 한 줄. 정책 문자열에는 따옴표 · 꺾쇠가 없어 그대로 넣는다. */
export function cspMeta(scripts) {
  return `<meta http-equiv="Content-Security-Policy" content="${cspPolicy(scripts)}">`
}
