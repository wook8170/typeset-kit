// 공개 진입점 `typeset-kit/config` — 설정 스키마 · 검증 · 읽기 · 문서별 설정을 내보낸다.
// 부르는 곳: 패키지 사용자(설정을 직접 검사하려는 도구), 테스트.
// 먼저 읽을 파일: config/schema.mjs.
export { CONFIG_SCHEMA, CONFIG_FILES, LOCALES, MODES, WRITING_RULE_MODES } from './schema.mjs'
export { validateConfig } from './validate.mjs'
export { loadConfig, findConfigFile, ConfigError } from './load.mjs'
export { documentSettings, selectDocuments, mergeOverride, UnknownDocumentError } from './document.mjs'
