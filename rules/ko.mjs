// 한국어 글쓰기 규칙의 표현 목록 — 규칙 이름마다 [{ pattern, suggest }] 를 둔다. pattern 은 정규식 원문이다.
// 부르는 곳: checks/writing/run.mjs(글쓰기 검사), checks/guidance/run.mjs(지침이 자기 규칙을 어기는지).
// 먼저 읽을 파일: ../../lib/markdown.mjs(어느 줄에 적용하는가).

// 통용 용어를 억지로 옮긴 낱말. 「시험 · 가지 · 판」은 다른 뜻으로도 쓰이므로 낱말 조합으로만 잡는다.
const FORCED_TRANSLATION = [
  { pattern: '단위 시험', suggest: '단위 테스트' },
  { pattern: '통합 시험', suggest: '통합 테스트' },
  { pattern: '종단 시험', suggest: 'e2e 테스트' },
  { pattern: '회귀 시험', suggest: '회귀 테스트' },
  { pattern: '시험 (케이스|파일|코드)', suggest: '테스트 케이스 · 테스트 파일 · 테스트 코드' },
  { pattern: '시험을 (돌리|돌려|돌린)', suggest: '테스트를 돌린다' },
  { pattern: '(기능|수리|작업|통합|릴리스) 가지(를|가|는|도|에|에서|로|의)?(?![가-힣])', suggest: '브랜치' },
  { pattern: '가지(를|에) (따|파|만들|합치|병합|머지|커밋|푸시)', suggest: '브랜치' },
  { pattern: '판 올림', suggest: '버전 올림' },
  { pattern: '(다음|이번|이전) 판(을|은|이|에|의|으로|에서|부터|까지)?(?![가-힣])', suggest: '버전' },
  { pattern: '끌어오기 요청', suggest: '풀 리퀘스트' },
]

// 과장 표현. 근거 없이 좋다고만 말하는 낱말이다.
const HYPE = [
  { pattern: '강력한', suggest: '무엇을 할 수 있는지 적는다' },
  { pattern: '획기적(인|으로)', suggest: '달라진 점을 수치나 사실로 적는다' },
  { pattern: '혁신적(인|으로)', suggest: '달라진 점을 수치나 사실로 적는다' },
  { pattern: '게임 체인저', suggest: '달라진 점을 수치나 사실로 적는다' },
  { pattern: '극대화', suggest: '무엇이 얼마나 나아지는지 적는다' },
  { pattern: '압도적(인|으로)', suggest: '수치로 적는다' },
]

// 기술 설명의 비유. 기술 용어로 쓰는 낱말(엔진 · 허브 · 신경망)은 넣지 않는다.
const METAPHOR = [
  { pattern: '두뇌', suggest: '실제로 하는 일을 적는다' },
  { pattern: '혈관', suggest: '실제로 하는 일을 적는다' },
  { pattern: '심장', suggest: '실제로 하는 일을 적는다' },
  { pattern: '레고 블록', suggest: '어떻게 조합하는지 적는다' },
  { pattern: '(퍼즐|마법)처럼', suggest: '실제로 일어나는 일을 적는다' },
]

// 글을 쓰는 과정이 드러나는 문구. 완성된 문서에는 결과만 남긴다.
const AI_TRACE = [
  { pattern: '(살펴|알아|분석해 |정리해 )보겠습니다', suggest: '과정 설명을 빼고 내용을 바로 적는다' },
  { pattern: '검토 결과', suggest: '확인한 사실을 바로 적는다' },
  { pattern: '(결론적으로|종합하면|요약하면)', suggest: '앞의 내용을 되풀이하지 않는다' },
  { pattern: '(수정|작업|반영)(을)? 완료했습니다', suggest: '작업 보고 문장을 뺀다' },
  { pattern: '(핵심은|중요한 점은)', suggest: '강조 문구 없이 내용을 적는다' },
  { pattern: '본 (문서|분석|보고서)에서는', suggest: '내용을 바로 적는다' },
]

// 사물이 사람처럼 움직이는 표현. 실제로 일어나는 일을 적는다.
const PERSONIFICATION = [
  { pattern: '(을|를) 삼(킨다|키는|키고|켜|켰다|킵니다)', suggest: '잡고 기록하지 않는다 · 버린다' },
  { pattern: '꼬리를 (문다|무는|물고|물었다|뭅니다)', suggest: '되풀이된다 · 이어진다' },
  { pattern: '(을|를) 깨(운다|우는|우고|워|웠다|웁니다)', suggest: '요청을 보낸다 · 시작한다' },
  { pattern: '(을|를) 고집(한다|하는|하고|해|했다|합니다)', suggest: '바뀌지 않는다 · 그대로 돌려준다' },
  { pattern: '헷갈려 ?(한다|하는|합니다)', suggest: '구분하지 못한다' },
  { pattern: '숨(을)? (쉰다|쉬는|쉽니다)', suggest: '실제로 하는 일을 적는다' },
]

export const RULES_KO = {
  hype: HYPE,
  metaphor: METAPHOR,
  'ai-trace': AI_TRACE,
  'forced-translation': FORCED_TRANSLATION,
  personification: PERSONIFICATION,
}
