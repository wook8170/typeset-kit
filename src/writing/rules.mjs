// 규칙 묶음 모으기 — 설정(언어 · 규칙 모드 · 추가 금지 표현)에 맞춰 이번에 적용할 규칙 목록을 만든다.
// 부르는 곳: writing/index.mjs. 순수 함수(파일을 읽지 않는다).
// 먼저 읽을 파일: rules/ko.mjs · rules/en.mjs(표현 목록), rules/extra-ko.mjs(추가 규칙).
import { RULES_EN } from '../../rules/en.mjs'
import { RULES_KO_EXTRA } from '../../rules/extra-ko.mjs'
import { RULES_KO } from '../../rules/ko.mjs'

export const NOUN_CHAIN = 'noun-chain'

/** 규칙 묶음마다 기본 모드. 설정에 없는 묶음 이름(`extraBanned` 로 만든 것)은 ratchet 이다. */
export const DEFAULT_RULE_MODES = Object.freeze({
  hype: 'ratchet',
  metaphor: 'ratchet',
  'ai-trace': 'ratchet',
  'forced-translation': 'ratchet',
  personification: 'ratchet',
  [NOUN_CHAIN]: 'warn',
  'dev-jargon': 'off',
})

const mergeGroups = (...tables) => {
  const merged = {}
  for (const table of tables) for (const [rule, list] of Object.entries(table)) merged[rule] = [...(merged[rule] ?? []), ...list]
  return merged
}

/** 설정의 extraBanned `{ 언어: [{ rule, pattern, suggest }] }` 에서 한 언어 몫을 `{ 규칙: [{ pattern, suggest }] }` 로 묶는다. */
function groupExtra(extraBanned, language) {
  const grouped = {}
  for (const extra of extraBanned?.[language] ?? []) (grouped[extra.rule] ??= []).push({ pattern: extra.pattern, suggest: extra.suggest ?? '' })
  return grouped
}

/** 알려진 묶음 이름(기본 규칙 + 추가 규칙 + 명사 사슬). */
export const knownRuleNames = (extraBanned) =>
  new Set([
    ...Object.keys(mergeGroups(RULES_KO, RULES_KO_EXTRA, RULES_EN)),
    NOUN_CHAIN,
    ...Object.values(extraBanned ?? {}).flatMap((list) => list.map((extra) => extra.rule)),
  ])

/** 규칙 모드를 정한다. 명사 사슬은 틀리게 잡는 일이 많아 warn 이나 off 만 허용한다. */
export function resolveRuleMode(rule, configuredModes) {
  const mode = configuredModes?.[rule] ?? DEFAULT_RULE_MODES[rule] ?? 'ratchet'
  return rule === NOUN_CHAIN && mode !== 'off' ? 'warn' : mode
}

/**
 * 이번에 적용할 규칙. 돌려주는 값 = { korean, english } 이고 각각 `{ 규칙: [{ pattern, suggest }] }` 다.
 * `off` 인 묶음은 뺀다. 한국어 규칙은 한글이 있는 줄에, 영어 규칙은 한글이 없는 줄에 적용된다(scan.mjs).
 */
export function selectRules({ languages, rules: configuredModes, extraBanned }) {
  const isActive = (rule) => resolveRuleMode(rule, configuredModes) !== 'off'
  const keepActive = (table) => Object.fromEntries(Object.entries(table).filter(([rule]) => isActive(rule)))
  return {
    korean: languages.includes('ko') ? keepActive(mergeGroups(RULES_KO, RULES_KO_EXTRA, groupExtra(extraBanned, 'ko'))) : {},
    english: languages.includes('en') ? keepActive(mergeGroups(RULES_EN, groupExtra(extraBanned, 'en'))) : {},
    nounChain: languages.includes('ko') && isActive(NOUN_CHAIN),
  }
}
