// 글쓰기 규칙 적용 — 산문 줄 목록에서 금지 표현과 명사 사슬을 찾는다. 모두 순수 함수다.
// 부르는 곳: writing/index.mjs(원고 파일마다 한 번).
// 먼저 읽을 파일: writing/rules.mjs(어떤 규칙을 적용하나), writing/extract.mjs(산문 줄 뽑기).
import { NOUN_CHAIN } from './rules.mjs'

const NOUN_CHAIN_MIN_WORDS = 4
// 조사나 서술 어미로 끝나는 낱말은 사슬을 끊는다. 틀리게 잡는 일을 줄이려고 끊는 쪽으로 넓게 잡았다.
const ENDS_WITH_PARTICLE = /[은는이가을를의에로와과도만서며고면다]$/
const HANGUL_WORD = /^[가-힣]{2,}$/
const HANGUL = /[가-힣]/

export const hasHangul = (text) => HANGUL.test(text)

const isChainWord = (word) => HANGUL_WORD.test(word) && !ENDS_WITH_PARTICLE.test(word)

/** 조사 없이 이어진 한글 낱말이 4개 이상인 곳을 [{ text }] 로 돌려준다. */
export function findNounChains(lineText) {
  const chains = []
  let chain = []
  const close = () => {
    if (chain.length >= NOUN_CHAIN_MIN_WORDS) chains.push({ text: chain.join(' ') })
    chain = []
  }
  for (const word of lineText.split(/\s+/)) {
    if (isChainWord(word)) chain.push(word)
    else close()
  }
  close()
  return chains
}

function findExpressions(lineText, rule, expressions, flags) {
  return expressions.flatMap((expression) =>
    [...lineText.matchAll(new RegExp(expression.pattern, flags))]
      .filter((match) => match[0] !== '')
      .map((match) => ({ rule, text: match[0], suggest: expression.suggest ?? '', start: match.index, end: match.index + match[0].length })),
  )
}

/** 같은 묶음 안에서 겹치는 구간은 먼저 찾은 것만 남긴다. 같은 낱말이 두 표현에 걸려도 한 건으로 센다. */
function dropOverlaps(matches) {
  const kept = []
  for (const match of matches) {
    const isOverlapping = kept.some((other) => other.rule === match.rule && match.start < other.end && other.start < match.end)
    if (!isOverlapping) kept.push(match)
  }
  return kept
}

/** 덩어리 글을 원본 줄 조각으로 나눈다. 돌려주는 값 = [{ at, text }] (at 은 덩어리 안의 시작 글자 위치). */
function lineSegments(text, breaks = []) {
  if (breaks.length < 2) return [{ at: 0, text }]
  return breaks.map((mark, index) => ({ at: mark.at, text: text.slice(mark.at, breaks[index + 1]?.at ?? text.length) }))
}

/**
 * 한글이 든 덩어리에는 한국어 규칙을 덩어리 전체에 적용한다(줄 경계에 걸친 표현도 찾는다).
 * 영어 규칙은 한글이 없는 글에 적용한다(대소문자를 가리지 않는다). 한글 덩어리 안에서는 한글이 없는 줄만 본다.
 */
function findBanned(text, rules, breaks) {
  const apply = (table, flags, part, offset = 0) =>
    Object.entries(table).flatMap(([rule, list]) => findExpressions(part, rule, list, flags).map((match) => ({ ...match, start: match.start + offset, end: match.end + offset })))
  if (!hasHangul(text)) return dropOverlaps(apply(rules.english, 'gi', text))
  const englishLines = lineSegments(text, breaks).filter((segment) => !hasHangul(segment.text))
  return dropOverlaps([...apply(rules.korean, 'g', text), ...englishLines.flatMap((segment) => apply(rules.english, 'gi', segment.text, segment.at))])
}

/** 덩어리 글의 start 번째 글자가 원본의 몇 번째 줄인가. 줄 나눔 정보(breaks)가 없으면 덩어리의 첫 줄이다. */
function lineAt(entry, start) {
  const reached = (entry.breaks ?? []).filter((mark) => mark.at <= start)
  return reached.length ? reached[reached.length - 1].line : entry.line
}

/**
 * 산문 줄 [{ line, text }] 에서 찾은 것 [{ line, rule, text, suggest }].
 * rules 는 selectRules 의 결과 { korean, english, nounChain } 이다.
 */
export function scanLines(lines, rules) {
  return lines.flatMap((entry) => {
    // 풀어 쓴 한글(NFD)은 한글 범위 검사와 규칙의 낱말에 걸리지 않는다. 그래서 모아 쓴 꼴(NFC)로 맞춘 뒤 본다.
    const text = entry.text.normalize('NFC')
    const banned = findBanned(text, rules, entry.breaks).map((match) => ({ ...match, line: lineAt(entry, match.start) }))
    const chains = rules.nounChain && hasHangul(text) ? findNounChains(text).map((chain) => ({ rule: NOUN_CHAIN, text: chain.text, suggest: '' })) : []
    return [...banned, ...chains].map((match) => ({ line: match.line ?? entry.line, rule: match.rule, text: match.text, suggest: match.suggest }))
  })
}
