// 낱말 묶음 고르기 — 설정 locale 에 맞는 낱말 묶음을 고르고, 프로젝트가 낱말 단위로 덮어쓴 값을 합친다.
// 부르는 곳: render/index.mjs, modes/spec.mjs(쪽 번호 표기의 표지 낱말).
// 먼저 읽을 파일: render/locale/ko.mjs(키 목록).
import en from './en.mjs'
import ko from './ko.mjs'

export const LOCALE_WORDS = Object.freeze({ ko, en })

/** locale 의 낱말 묶음에 overrides 를 합친다(순수 함수). callouts 는 종류마다 합친다. 모르는 locale 은 오류다. */
export function localeWords(locale = 'ko', overrides = {}) {
  const base = LOCALE_WORDS[locale]
  if (!base) throw new Error(`Unknown locale: ${locale} (known: ${Object.keys(LOCALE_WORDS).join(', ')})`)
  return { ...base, ...overrides, callouts: { ...base.callouts, ...overrides.callouts } }
}
