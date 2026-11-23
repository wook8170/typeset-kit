// 설정 스키마 — typeset.config.mjs(.json) 가 가질 수 있는 키와 기본값을 선언한다.
// 부르는 곳: config/validate.mjs(이 선언대로 검사하고 기본값을 채운다), docs/contract.md 「설정 계약」(사람이 읽는 판).
// 먼저 읽을 파일: config/validate.mjs(선언 종류마다 해석 함수가 하나씩 있다).

export const LOCALES = ['ko', 'en']
export const MODES = ['book', 'spec', 'pages']
export const WRITING_RULE_MODES = ['off', 'warn', 'ratchet', 'fail']
export const CONFIG_FILES = ['typeset.config.mjs', 'typeset.config.json']

// 선언 도우미. 종류(kind)마다 validate.mjs 에 해석 함수가 하나씩 있다.
export const text = (fallback = '') => ({ kind: 'text', fallback })
export const pattern = (regex, fallback = '') => ({ kind: 'pattern', regex, fallback })
export const count = (fallback = 0) => ({ kind: 'count', fallback })
export const number = (min, max, fallback) => ({ kind: 'number', min, max, fallback })
export const flag = (fallback = false) => ({ kind: 'flag', fallback })
export const literal = (value) => ({ kind: 'literal', value, fallback: value })
export const choice = (options, fallback) => ({ kind: 'choice', options, fallback })
export const list = (item, fallback = []) => ({ kind: 'list', item, fallback })
export const tuple = (items) => ({ kind: 'tuple', items, fallback: items.map((item) => item.fallback) })
export const dict = (item, fallback = {}) => ({ kind: 'dict', item, fallback })
export const oneOf = (options, fallback) => ({ kind: 'oneOf', options, fallback })
export const record = (keys, required = []) => ({ kind: 'record', keys, required })
/** 문서별 덮어쓰기. 준 키만 검사하고 기본값을 채우지 않는다. 그래야 전역 값과 합칠 때 빠진 키가 전역 값을 지우지 않는다. */
export const partial = (node) => ({ kind: 'partial', node, fallback: undefined })

const fontFile = record(
  {
    path: text(),
    weight: oneOf([count(), text()], 400),
    style: choice(['normal', 'italic'], 'normal'),
  },
  ['path'],
)
const fontSpec = (fallback) =>
  oneOf([pattern(/^builtin:[a-z0-9-]+$/), record({ family: text(), files: list(fontFile) }, ['family', 'files'])], fallback)

export const THEME = record({
  preset: choice(['light-cover'], 'light-cover'),
  hue: number(0, 360, 250),
  fonts: record({ sans: fontSpec('builtin:noto-sans-kr'), mono: fontSpec('builtin:jetbrains-mono') }),
  page: record({ size: choice(['A4'], 'A4'), orientation: choice(['portrait', 'landscape'], 'portrait') }),
  callouts: dict(text()),
})

export const COVER = record({
  meta: list(tuple([text(), text()])),
  topics: list(text()),
  approvalBox: oneOf([literal(false), list(text())], false),
})

export const HEADER = record({ left: text('{title}'), right: text('{chapter} › {section}') })
export const FOOTER = record({ left: text('{brand} {title} · {edition}'), right: text('{page}') })

export const TYPESET = record({
  tableFillSplit: count(0),
  landTables: choice(['off', 'auto'], 'off'),
  landTableMinCols: count(8),
  fitFigures: flag(false),
  sectionListMax: count(0),
})

const DOCUMENT = record(
  {
    id: pattern(/^[a-z0-9][a-z0-9-]*$/),
    mode: choice(MODES, 'book'),
    src: oneOf([text(), list(text())], ''),
    title: text(),
    out: text(),
    revisions: text(),
    theme: partial(THEME),
    cover: partial(COVER),
    header: partial(HEADER),
    footer: partial(FOOTER),
    typeset: partial(TYPESET),
    vars: dict(text()),
    toc: flag(false),
    writing: flag(true),
  },
  ['id', 'mode', 'src'],
)

const WRITING = record({
  languages: list(choice(LOCALES, 'ko'), ['ko']),
  globs: list(text()),
  rules: dict(choice(WRITING_RULE_MODES, 'ratchet')),
  extraBanned: dict(list(record({ rule: text(), pattern: text(), suggest: text() }, ['rule', 'pattern']))),
  allow: list(record({ file: text(), rule: text(), reason: text() }, ['file', 'rule', 'reason'])),
  baseline: text('typeset.writing-baseline.json'),
})

export const CONFIG_SCHEMA = record(
  {
    locale: choice(LOCALES, 'ko'),
    outDir: text('typeset-out'),
    brand: record({ name: text(), logo: text(), publisher: text(), contact: text() }),
    browser: record({ path: text(), timeoutMs: count(0) }),
    theme: THEME,
    cover: COVER,
    header: HEADER,
    footer: FOOTER,
    limits: record({ imageMaxPx: count(2000), pdfMaxMb: count(90) }),
    typeset: TYPESET,
    documents: list(DOCUMENT),
    writing: WRITING,
  },
  ['documents'],
)

/** 특정 모드에서만 뜻이 있는 문서 키. 다른 모드에 쓰면 오타일 가능성이 커서 오류로 본다. */
export const MODE_ONLY_KEYS = {
  vars: ['pages'],
  toc: ['pages'],
  revisions: ['book'],
}
