// 종료 코드 — 명령이 돌려주는 종료 코드의 뜻을 한곳에 둔다.
// 부르는 곳: cli/main.mjs, cli/commands/*.
// 먼저 읽을 파일: 없음.

/** 0 = 통과, 1 = 검사 · 굽기 실패, 2 = 인자 · 설정 오류 또는 아직 없는 단계. */
export const EXIT = Object.freeze({ ok: 0, failed: 1, usage: 2 })
