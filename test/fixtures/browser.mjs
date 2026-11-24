// 브라우저 테스트 도우미 — 헤드리스 브라우저를 찾지 못하면 그 까닭을 건너뛰기 사유로 돌려준다.
// 부르는 곳: test/render/layout · land-tables · csp, test/modes/spec(브라우저를 띄우는 테스트).
// 먼저 읽을 파일: src/browser/find.mjs.
import { findBrowser } from '../../src/browser/find.mjs'

/** 브라우저가 있으면 false, 없으면 건너뛰기 사유(문자열). node:test 의 skip 옵션에 그대로 넣는다. */
export function browserSkipReason() {
  try {
    findBrowser()
    return false
  } catch (error) {
    return error.message.split('\n')[0]
  }
}
