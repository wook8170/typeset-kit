// 추가 한국어 규칙 — lanekit 규칙 묶음에 없는 표현. 같은 묶음 이름에 더하고, 개발자 방언은 `dev-jargon` 묶음으로 따로 둔다.
// 부르는 곳: src/writing/rules.mjs. `dev-jargon` 은 기본값이 꺼짐이다(개발 문서에서는 정상 용어이기 때문이다).
// 먼저 읽을 파일: ko.mjs(같은 모양의 기본 목록, lanekit 사본이라 고치지 않는다).

export const RULES_KO_EXTRA = {
  hype: [
    { pattern: '강력하게', suggest: '무엇을 할 수 있는지 적는다' },
    { pattern: '[Ss]eamless(ly)?|심리스', suggest: '사용자가 하지 않아도 되는 일을 적는다' },
    { pattern: '\\b[Rr]obust\\b', suggest: '어떤 실패를 견디는지 적는다' },
    { pattern: '\\b[Ss]calable\\b', suggest: '어디까지 늘릴 수 있는지 수치로 적는다' },
  ],
  'ai-trace': [
    { pattern: '(해|아|어) ?보겠습니다', suggest: '과정 설명을 빼고 내용을 바로 적는다' },
    { pattern: '다음 ?단계에서는', suggest: '내용을 바로 적는다' },
    { pattern: '\\b(TODO|FIXME|TBD)\\b', suggest: '초안 표시를 지운다' },
  ],
  'dev-jargon': [
    { pattern: '파이프라인', suggest: '처리 절차 · 처리 흐름' },
    { pattern: '오케스트레이션', suggest: '작업 통합 관리' },
    { pattern: '글루 ?(코드|레이어)|\\b[Gg]lue\\b', suggest: '연계 기능' },
    { pattern: 'source of truth|\\bSoT\\b', suggest: '기준 정보' },
    { pattern: '부트스트랩|\\b[Bb]ootstrap\\b', suggest: '초기 구성' },
    { pattern: '꽂(는다|아 ?넣|으면)', suggest: '필요한 기능을 추가할 수 있도록 구성' },
    { pattern: 'loose(ly)? coupl', suggest: '시스템 간 의존성을 최소화' },
    { pattern: 'fail[- ]fast', suggest: '오류를 조기에 확인' },
    { pattern: 'graceful(ly)? degrad', suggest: '일부 장애 시에도 가능한 기능은 계속 제공' },
    { pattern: 'single pane of glass', suggest: '통합 관리 화면' },
  ],
}
