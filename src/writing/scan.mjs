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

/** 한글 줄에는 한국어 규칙, 한글 없는 줄에는 영어 규칙을 적용한다(영어 규칙은 대소문자를 가리지 않는다). */
function findBanned(lineText, rules) {
  const apply = (table, flags) => Object.entries(table).flatMap(([rule, list]) => findExpressions(lineText, rule, list, flags))
  return dropOverlaps(hasHangul(lineText) ? apply(rules.korean, 'g') : apply(rules.english, 'gi'))
}

/**
 * 산문 줄 [{ line, text }] 에서 찾은 것 [{ line, rule, text, suggest }].
 * rules 는 selectRules 의 결과 { korean, english, nounChain } 이다.
 */
export function scanLines(lines, rules) {
  return lines.flatMap((entry) => {
    const banned = findBanned(entry.text, rules)
    const chains = rules.nounChain && hasHangul(entry.text) ? findNounChains(entry.text).map((chain) => ({ rule: NOUN_CHAIN, text: chain.text, suggest: '' })) : []
    return [...banned, ...chains].map((match) => ({ line: entry.line, rule: match.rule, text: match.text, suggest: match.suggest }))
  })
}
