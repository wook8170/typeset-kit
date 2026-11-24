# writing — 글쓰기 검사

원고에서 쓰지 않기로 한 표현(과장 · 비유 · AI 작성 흔적 · 억지 번역 · 의인화)과 명사 사슬을 찾는다. `check-writing` 명령이 부른다.

## 들어오는 곳

`src/index.mjs` 의 `checkWriting({ cwd, configFile, mode })` 가 설정을 읽은 뒤 `index.mjs` 의 `checkWriting({ root, config, mode })` 를 부른다.

## 거치는 순서

1. `targets.mjs` — 문서의 `src` 와 `writing.globs` 에서 파일을 모으고 원고 종류(markdown · spec · html)를 붙인다. `glob.mjs` 가 글롭을 펼친다.
2. `extract.mjs` — 종류마다 독자에게 나가는 글만 줄 목록으로 뽑는다. 코드 · 주석 · 태그 · 이름표 필드는 뺀다.
3. `rules.mjs` — 설정의 `languages` · `rules` · `extraBanned` 로 이번에 적용할 규칙을 고른다. 표현 목록은 `rules/` 폴더에 있다.
4. `scan.mjs` — 한글 줄에는 한국어 규칙, 한글 없는 줄에는 영어 규칙을 적용하고 명사 사슬을 찾는다.
5. `baseline.mjs` — `ratchet` 규칙의 건수를 「규칙 × 파일」 칸으로 세어 기준선과 견준다. 늘어난 칸이 있으면 실패한다.

## 규칙 모드

| 모드 | 동작 |
|---|---|
| `off` | 찾지 않는다 |
| `warn` | 보여 주기만 한다 |
| `ratchet` | 기준선보다 늘면 실패한다. 줄면 재잠금을 안내한다 |
| `fail` | 하나라도 있으면 실패한다 |

기본값은 `dev-jargon` 이 `off`, 명사 사슬이 `warn`(다른 모드를 줘도 `warn`), 나머지는 `ratchet` 이다.

## 규칙 파일

`rules/ko.mjs` · `rules/en.mjs` 는 lanekit 의 규칙 파일을 그대로 복사한 것이다. 고치지 않는다. `rules/SOURCE.json` 에 정본 해시를 적어 두었고, 릴리스 전에 `node scripts/check-rules-hash.mjs <정본 폴더>` 로 대조한다. 이 도구에만 있는 표현은 `rules/extra-ko.mjs` 에 둔다.

## 먼저 읽을 파일

`index.mjs`(전체 흐름), `rules.mjs`(규칙 고르기).
