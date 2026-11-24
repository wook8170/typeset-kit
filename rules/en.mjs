// 영어 글쓰기 규칙의 표현 목록 — 규칙 이름마다 [{ pattern, suggest }] 를 둔다. 대소문자를 가리지 않고 맞춘다.
// 부르는 곳: checks/writing/run.mjs. 한글 문서 안의 영어 낱말에도 적용한다.
// 먼저 읽을 파일: rules-ko.mjs(같은 모양의 한국어 목록).

const HYPE = [
  { pattern: '\\bseamless(ly)?\\b', suggest: 'say what the user no longer has to do' },
  { pattern: '\\brobust\\b', suggest: 'say which failures it handles' },
  { pattern: '\\bgame[- ]chang(er|ing)\\b', suggest: 'state the change as a fact or a number' },
  { pattern: '\\brevolutionary\\b', suggest: 'state the change as a fact or a number' },
  { pattern: '\\bcutting[- ]edge\\b', suggest: 'name the technique' },
  { pattern: '\\bworld[- ]class\\b', suggest: 'give the measurement' },
  { pattern: '\\bblazing(ly)? fast\\b', suggest: 'give the measurement' },
  { pattern: '\\bstate[- ]of[- ]the[- ]art\\b', suggest: 'name the technique' },
]

const AI_TRACE = [
  { pattern: "\\blet'?s (dive|take a look|explore)\\b", suggest: 'start with the content' },
  { pattern: '\\bin conclusion\\b', suggest: 'do not restate what was already said' },
  { pattern: '\\bto summari[sz]e\\b', suggest: 'do not restate what was already said' },
  { pattern: "\\bit(’|')?s worth noting\\b", suggest: 'state the point directly' },
  { pattern: '\\bit is important to note\\b', suggest: 'state the point directly' },
  { pattern: '\\bi hope this helps\\b', suggest: 'remove the closing remark' },
  { pattern: '\\bas an ai\\b', suggest: 'remove the remark about the writer' },
  { pattern: '\\bdelve\\b', suggest: 'use a plain verb such as "look at"' },
]

export const RULES_EN = {
  hype: HYPE,
  'ai-trace': AI_TRACE,
}
