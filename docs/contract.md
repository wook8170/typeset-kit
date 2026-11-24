# typeset-kit 계약

이 문서는 조판 단계들이 주고받는 값의 꼴을 정한다. 설정 · 책 명세 · 블록 · 모드 모듈 · 쪽 나누기 스크립트 · 검사 결과가 대상이다. 각 단계는 이 꼴만 믿고 따로 만들 수 있다. 계약을 바꾸려면 이 문서와 그 계약을 검사하는 코드를 같은 변경에서 고친다. 검사 코드는 `src/config/schema.mjs` 와 `src/spec/contract.mjs` 다.

## 1. 파일 소유와 진입 함수

아래 표의 파일은 표에 적힌 함수를 내보내야 한다. 굽기 흐름(`src/build/index.mjs`)과 공개 진입점은 이 파일들을 필요할 때 불러온다(`src/stages.mjs`). 파일이 아직 없으면 명령은 「아직 구현되지 않은 단계」라고 알리고 종료 코드 2 로 끝난다.

| 파일 | 내보내는 것 | 맡는 레인 |
|---|---|---|
| `src/modes/spec.mjs` | `buildDocument(job)` — 책 명세 문서 굽기, `buildSpec(job, spec, deps)` — 이미 만든 명세 굽기(book 모드가 부른다) | T2 |
| `src/render/index.mjs` | `renderPrintHtml(spec, options)` · `renderBody(spec, options)` | T2 |
| `src/render/` 의 `blocks` · `front` · `running` · `styles` · `table-widths` · `landscape` · `csp` · `svg-guard` · `locale/index` | 렌더 안쪽 파일. 공개 진입점은 `render/index.mjs` 다 | T2 |
| `src/render/paginator.mjs` | `paginatorScript` · `pageChromeCss` · `roman` | T2 |
| `src/render/locale/ko.mjs` · `en.mjs` | 문서 안에 찍히는 낱말 묶음 | T2 |
| `src/theme/index.mjs` | 기본 테마 값 · `defineTheme` | T2 |
| `src/modes/pages.mjs` | `buildDocument(job)` — 쪽 HTML 문서 굽기 | T3 |
| `src/pdf/index.mjs` | `applyPdfNav` · `applyPdfNavBytes(bytes, { pageLabels, outline, links, objectStreams })` · `mergePdfs` · `inspectPdf(bytes)` | T3 |
| `src/pdf/` 의 `nav` · `merge` · `inspect` · `destinations`, `src/check/rules.mjs`, `src/modes/pages/*` | 안쪽 파일(크기 상한 때문에 나눴다) | T3 |
| `src/check/index.mjs` | `checkPdfs(paths, options)` | T3 |
| `src/writing/index.mjs` | `checkWriting({ root, config, mode })` | T4 |
| `src/fonts/builtin.mjs` | `BUILTIN_FONTS` 표 | T4 |
| `src/fonts/css.mjs` | `fontCss(fontSpecs, { root })` — `fontSpecs` 는 글꼴 지정의 **목록**이다(예: `[theme.fonts.sans, theme.fonts.mono]`). 동기 함수이고 CSS 문자열을 돌려준다 | T4 |
| `src/input/markdown.mjs` | `markdownToSpec(text, options)` · `parseMarkdown` · `mergeParts` | T5 |
| `src/input/images.mjs` | `inlineSpecImages(spec, { root, limits, cdp })` → `{ spec, problems }`. 그림 파일을 data 주소로, inline SVG 를 `svgText` 로 바꾸고 큰 PNG 를 줄인다. 없는 파일 · 바깥 주소는 `missing-file` 문제다 | T5 |
| `src/input/` 의 `markdown-blocks` · `markdown-inline` · `png` · `image-shrinker` | 안쪽 파일 | T5 |
| `src/modes/book.mjs` | `buildDocument(job)` — Markdown 을 명세로 바꾼 뒤 `buildSpec` 에 넘긴다 | T5 |
| `src/web/index.mjs` · `styles.mjs` | `renderWebHtml(spec, { settings, fontCss, theme })` — 웹판 HTML 문자열 | T5 |

T1 이 만든 파일은 다음과 같다. 다른 레인은 이 파일을 고치지 않고, 바꿀 것이 있으면 메인에 요청한다.

- `package.json` · `bin/` · `src/cli/` · `src/config/` · `src/spec/`
- `src/browser/` · `src/doctor/` · `src/build/` · `src/stages.mjs` · `src/platform.mjs` · `src/index.mjs`

의존을 더할 레인(T5 의 `marked` 등)은 정확한 버전을 보고서에 적는다. 메인이 `package.json` 에 넣는다.

`package.json` 의 `exports` 에는 하위 경로 여덟 개를 미리 적어 두었다(`.` · `./config` · `./spec` · `./browser` · `./paginator` · `./render` · `./theme` · `./pdf-nav`). 그래서 다른 레인은 `package.json` 을 고치지 않고 표의 파일만 만들면 된다.

## 2. 설정 계약

설정 파일은 저장소 루트의 `typeset.config.mjs`(기본 내보내기 객체) 또는 `typeset.config.json` 이다. 아래 폴더에서 위로 올라가며 찾고, 한 폴더에 둘 다 있으면 `.mjs` 를 쓴다. 설정 안의 상대 경로는 설정 파일이 있는 폴더(root) 기준이다.

모르는 키는 오류다. 꼴이 틀린 값도 오류다. 오류가 하나라도 있으면 어떤 명령도 굽지 않는다.

| 키 | 꼴 | 기본값 | 뜻 |
|---|---|---|---|
| `locale` | `ko` \| `en` | `ko` | 문서 안 낱말 묶음 |
| `outDir` | 문자열 | `typeset-out` | 출력 폴더 |
| `brand.name` · `logo` · `publisher` · `contact` | 문자열 | `''` | 표지 · 꼬리글에 쓰는 이름. `logo` 는 SVG 파일 경로이고, 비면 마크 자리를 비운다 |
| `browser.path` | 문자열 | `''` | 브라우저 실행 파일. 비면 `CHROME_BIN` → 운영체제 기본 위치 순서로 찾는다 |
| `browser.timeoutMs` | 0 이상 정수 | `0` | 쪽 나누기 시간 상한. 0 이면 문서 크기에 비례해 스크립트가 정한다 |
| `theme.preset` | `light-cover` | `light-cover` | 테마 프리셋 |
| `theme.hue` | 0 ~ 360 | `250` | 문서 색(oklch 색상 각). 책 명세의 `hue` 가 있으면 그 값이 먼저다 |
| `theme.fonts.sans` · `mono` | `builtin:<이름>` 또는 `{ family, files: [{ path, weight, style }] }` | `builtin:noto-sans-kr` · `builtin:jetbrains-mono` | 글꼴. 파일이 없으면 굽기가 실패한다 |
| `theme.page.size` | `A4` | `A4` | 쪽 크기 |
| `theme.page.orientation` | `portrait` \| `landscape` | `portrait` | 책 전체의 쪽 방향 |
| `theme.callouts` | `{ 종류: CSS 색 }` | `{}` | 기본 콜아웃(`note` · `caution` · `warning`)에 더할 종류와 색 |
| `cover.meta` | `[[이름, 값], …]` | `[]` | 표지 메타 칸. 칸 수와 이름이 자유롭다 |
| `cover.topics` | 문자열 목록 | `[]` | 표지의 「다루는 것」 |
| `cover.approvalBox` | `false` 또는 낱말 목록 | `false` | 결재 칸. 예: `['작성', '검토', '승인']` |
| `header.left` · `right` | 자리표시자 문자열 | `{title}` · `{chapter} › {section}` | 머리글 |
| `footer.left` · `right` | 자리표시자 문자열 | `{brand} {title} · {edition}` · `{page}` | 꼬리글 |
| `limits.imageMaxPx` | 0 이상 정수 | `2000` | 긴 변이 이보다 큰 PNG 는 줄여서 넣는다 |
| `limits.pdfMaxMb` | 0 이상 정수 | `90` | PDF 크기 상한. 넘으면 파일을 지우고 실패한다 |
| `typeset.tableFillSplit` | 0 이상 정수 | `0` | 쪽 끝 표 쪼개기의 최소 행 수. 0 이면 끈다 |
| `typeset.landTables` | `off` \| `auto` | `off` | 열이 많은 표를 그 쪽만 가로로 싣는다 |
| `typeset.landTableMinCols` | 0 이상 정수 | `8` | `auto` 일 때 가로로 싣는 열 수 기준 |
| `typeset.fitFigures` | 참거짓 | `false` | 그림마다 자리(본문 · 한 쪽 · 가로 쪽)를 고른다 |
| `typeset.sectionListMax` | 0 이상 정수 | `0` | 장 표지의 절 목록 상한. 0 이면 상한이 없다 |
| `typeset.tableColWidths` | `equal` \| `content` | `equal` | 표 열 폭. `content` 면 칸 글 길이로 잰다(표의 `widths` 가 먼저다) |
| `typeset.splitSectionList` | 참거짓 | `false` | 장 표지의 절 목록이 한 쪽을 넘으면 다음 쪽으로 이어 싣는다 |
| `documents` | 목록(필수) | — | 아래 문서 키 |
| `writing` | 묶음 | 아래 | 글쓰기 검사 |

자리표시자는 `{title}` · `{brand}` · `{edition}` · `{chapter}` · `{section}` · `{page}` 여섯 개다. 해석은 렌더(T2)가 한다.

선택 사항의 기본값은 모두 「끔」이다. 그래서 켜지 않은 문서는 버전을 올려도 조판 결과가 바뀌지 않는다.

**문서 키** (`documents[]`)

| 키 | 꼴 | 뜻 |
|---|---|---|
| `id` | 소문자 · 숫자 · 붙임표(필수) | `build <id>` 로 고를 때와 출력 파일 이름에 쓴다. 겹치면 오류다 |
| `mode` | `book` \| `spec` \| `pages`(필수) | 입력 방식 |
| `src` | 경로 또는 경로 목록(필수) | `book` 은 Markdown, `spec` 은 `.mjs` · `.json`, `pages` 는 HTML 글롭 |
| `title` | 문자열 | 문서 제목. 책 명세에 제목이 있으면 그 값이 먼저다 |
| `out` | 문자열 | 출력 파일 이름(확장자 없이). 비면 `id` 를 쓴다 |
| `revisions` | 경로 | `book` 전용. 개정 이력 JSON |
| `theme` · `cover` · `header` · `footer` · `typeset` | 전역과 같은 키의 일부 | 이 문서만 덮어쓴다 |
| `vars` | `{ 이름: 값 }` | `pages` 전용. 원고의 `{{이름}}` 을 채운다. 원고에 있는데 `vars` 에 없는 이름이 있으면 실패한다 |
| `toc` | 참거짓 | `pages` 전용. 차례 면을 만든다 |
| `writing` | 참거짓(기본 `true`) | `false` 면 이 문서를 글쓰기 검사에서 뺀다 |

`vars` · `toc` 를 `pages` 가 아닌 문서에, `revisions` 를 `book` 이 아닌 문서에 쓰면 오류다.

**글쓰기 키** (`writing`)

| 키 | 꼴 | 기본값 |
|---|---|---|
| `languages` | `ko` · `en` 목록. 빈 목록이면 검사를 끈다 | `['ko']` |
| `globs` | 조판 원고 밖에서 더 볼 글 | `[]` |
| `rules` | `{ 규칙 묶음: off \| warn \| ratchet \| fail }` | `{}`(규칙 묶음의 기본 모드를 쓴다) |
| `extraBanned` | `{ 언어: [{ rule, pattern, suggest }] }` | `{}` |
| `allow` | `[{ file, rule, reason }]` | `[]` |
| `baseline` | 경로 | `typeset.writing-baseline.json` |

## 3. 문서 설정(settings)

렌더와 모드 모듈은 전역 설정을 직접 읽지 않는다. 대신 `documentSettings(config, document)`(`src/config/document.mjs`)가 만든 settings 한 벌을 받는다. settings 는 전역 값에 문서의 덮어쓰기를 합친 것이다. 합칠 때 객체는 키마다 안으로 들어가 합치고, 배열과 값은 문서 쪽 값으로 바꾼다.

```js
{
  id, mode, title,           // 문서 키 그대로
  locale,                    // 'ko' | 'en'
  brand: { name, logo, publisher, contact },
  limits: { imageMaxPx, pdfMaxMb },
  theme, cover, header, footer, typeset,   // 2절의 꼴, 기본값이 모두 채워져 있다
}
```

`brand.logo` 와 글꼴 파일의 경로는 root 기준 상대 경로 그대로 들어 있다. 절대 경로로 바꾸는 것은 받는 쪽이 job.root 로 한다.

## 4. 블록 계약

### 4.1 책 명세

`spec` 모드의 원고이고, `book` 모드가 Markdown 을 바꾼 결과다. 검사는 `validateSpec(spec, { calloutKinds, extraBlocks })` 가 한다. 렌더는 검사를 통과한 명세만 받는다.

```js
{
  title: '설치 안내서',            // 필수
  subtitle: 'Installation Guide',  // 표지의 둘째 제목(선택)
  lede: '…',                       // 표지 요약, 인라인 마크업(선택)
  hue: 250,                        // 문서 색(선택). theme.hue 보다 먼저다
  conventions: '…',                // 차례 쪽의 「표기 규칙」 상자, 인라인 마크업(선택)
  docInfo: {                       // 문서 정보 쪽(선택). 없으면 그 쪽을 만들지 않는다
    revisions: [['1.0', '2026-01-05', '처음 씀', 'Acme']],   // [버전, YYYY-MM-DD, 변경 내용(마크업), 작성]
    readers: ['운영 담당자'],                                  // 마크업 목록
    related: [['DOC-02', '운영 안내서', '설치 뒤에 읽는다']],  // [번호, 이름, 관계(마크업)]
    contact: [['메일', 'docs@example.com']],                  // [이름, 값(마크업)]
  },
  chapters: [                      // 필수
    {
      no: '1', label: '부록',      // 둘 중 하나는 필수. label 이 있으면 번호 대신 표시한다
      title: '시작하기',           // 필수
      summary: '…',                // 장 표지 요약(마크업)
      facts: [{ label, value, note }],   // 장 표지 칸(선택)
      sections: [{ no: '1.1', title: '설치', mono: 'install', blocks: [/* 4.2 */] }],
    },
  ],
}
```

- 발행 정보 `edition` · `issued` 는 개정 이력의 마지막 날짜 행에서 렌더가 뽑는다. 원고에 적지 않는다.
- 표지 메타 · 결재 칸 · 발행처는 명세가 아니라 settings(`cover` · `brand`)에서 온다.
- 앵커는 원고에 적지 않는다. `assignAnchors(spec)` 가 장에 `ch<i>`, 절에 `ch<i>s<j>` 를 붙인다. 차례 링크 · 책갈피 · 쪽 번호가 이 이름을 쓴다.
- 장 제목은 책갈피 1단계, 절 제목은 2단계가 된다. 블록 안의 제목(`h3`)은 책갈피에 들어가지 않는다. 렌더는 `h3` 에 제목 요소(h1 ~ h6)를 쓰지 않는다.

### 4.2 블록

필드 종류는 둘로 나뉜다. 「마크업」 필드는 작성자가 쓴 인라인 HTML 을 그대로 넣는다. 「글」 필드는 렌더가 이스케이프한다. Markdown 변환(T5)은 마크업 필드에 넣기 전에 원문을 이스케이프한다.

| `t` | 필수 필드 | 선택 필드 | 비고 |
|---|---|---|---|
| `p` | `html`(마크업) | | 문단 |
| `lede` | `html`(마크업) | | 절 첫머리의 큰 문단 |
| `h3` | `text`(글) | `sub`(마크업) | 소제목. `sub` 는 제목 아래 한 줄로 붙는다 |
| `defs` | `rows`: `[[이름, 값(마크업)], …]` | | 정의 목록 |
| `steps` · `ol` | `items`: 마크업 또는 `{ html, code?, note? }` 목록 | `label`(글) · `start`(수) | 번호 목록. `code` 는 줄 목록 또는 문자열 |
| `ul` | `items`: 마크업 목록 | | 글머리 목록 |
| `code` | `lines`: 줄 목록 또는 문자열 | | 코드. 렌더가 이스케이프한다 |
| `table` | `rows`: 칸의 목록의 목록 | `head`(칸 목록) · `widths`(CSS 폭 목록) · `caption`(마크업) · `num`(글) · `land`(참거짓) · `compact`(참거짓) | 칸은 마크업 문자열 또는 `{ html, span?, mono?, strong?, align? }`. `land` 를 주면 `typeset.landTables` 판정보다 먼저다 |
| `callout` | `kind`(글) · `html`(마크업) | | `kind` 는 `note` · `caution` · `warning` 또는 `theme.callouts` 에 더한 이름. 표시 낱말은 언어 묶음에서 온다 |
| `figure` | `caption`(마크업), `src` 와 `svgText` 가운데 하나 | `num` · `alt` · `inline` · `px: { w, h }` · `maxh` · `marks: [{ n, x, y }]` · `fit: { mode, w, h }` | `src` 는 root 기준 경로 또는 data URI. `inline: true` 인 SVG 는 문서에 그대로 넣고 허용 목록 검사를 받는다 |
| `cards` | `items`: `[{ title(글), value(마크업), note?(마크업) }]` | `label`(글) | 수치 카드 |
| `sources` | `html`(마크업) | | 근거 줄. 앞 낱말은 언어 묶음에서 온다 |

- 그림 줄이기와 data URI 넣기는 렌더 전에 끝낸다(T5 `src/input/images.mjs`). 렌더가 받는 `figure.src` 는 data URI 이고, `inline` SVG 는 `svgText` 에 들어 있다.
- 확장 블록(예: 스토리보드)은 `extraBlocks: { 종류: 필드 표 }` 로 검사를 통과시키고, 렌더에는 같은 이름의 렌더 함수를 넘긴다. 0.1 에는 확장 블록이 없다.

### 4.3 Markdown 에서 블록으로 (book 모드)

| 원고 | 결과 |
|---|---|
| 첫 `#` | 명세 `title`. 없으면 문서 키 `title` |
| 첫 `##` 앞 문단 | `lede`(여럿이면 줄을 바꿔 잇는다). 문단 말고 다른 블록이 오면 오류다 |
| `##` | 장. 번호 `1` 부터. 바로 아래 첫 문단은 `summary` |
| `##` 와 첫 `###` 사이의 나머지 블록 | 장 제목을 이름으로 한 절 |
| `###` | 절. 번호 `장.절` |
| `####` 이하 | `h3` 블록 |
| 문단 | `p`. 작성자가 쓴 HTML 은 이스케이프하고 주석은 지운다. 링크는 `http` · `https` · `mailto` · `#` 만 남긴다 |
| 그림 하나만 있는 문단 `![캡션](경로 "제목")` | `figure`. 캡션은 제목, 없으면 대체 글. 번호 `장-순번`. 경로는 원고 폴더 기준이고 root 기준으로 바꾼다. `.svg` 는 `inline: true` |
| 글머리 목록 | `ul`. 겹친 목록은 항목 안 HTML 목록 |
| 번호 목록 | `ol`. 항목 안 코드 블록은 `{ html, code }`. 1 이 아닌 시작 번호는 `start` |
| 코드 블록 | `code` |
| 표(GFM) | `table`. 가운데 정렬 칸은 `{ html, align: 'center' }` |
| 인용문 | `callout`. 첫 낱말을 굵게 쓴 종류 이름(언어 묶음의 표시 낱말 또는 종류 키)이면 그 종류, 아니면 `note` |
| 가로줄 | 블록을 만들지 않는다 |

문서 키 `src` 가 목록이면 파일 순서대로 이어 한 권으로 만들고 장 번호도 잇는다. `revisions` JSON 은 `[[버전, 날짜, 변경, 작성], …]` 또는 `{ revisions, readers, related, contact }` 이고 `docInfo` 가 된다.

## 5. 모드 모듈 계약

굽기 흐름은 문서마다 그 모드의 `buildDocument(job)` 을 한 번 부른다. 브라우저는 굽기 흐름이 한 번만 띄워 모든 문서가 함께 쓴다.

```js
job = {
  document,       // 기본값이 채워진 문서 키(2절)
  settings,       // 3절
  root,           // 설정 파일 폴더(절대 경로)
  outDir,         // 출력 폴더(절대 경로, 이미 만들어져 있다)
  outputs,        // { pdf, printHtml, web } 참거짓
  allowOverflow,  // true 면 넘친 쪽을 문제로 세지 않는다
  session,        // PDF 를 구울 때만 { cdp, browserPath, timeoutMs }. 아니면 null
}
```

돌려주는 조판 보고는 다음 꼴이다. 굽기 흐름은 문서들의 보고를 모아 `outDir/typeset-report.json` 에 `{ documents: [보고, …] }` 로 쓴다.

```js
{
  id, mode,
  files: { pdf, printHtml, web },   // root 기준 상대 경로, / 로 나눈 꼴. 내지 않은 것은 null
  pages, frontPages,                // 표지 포함 쪽 수, 표지 뒤 앞붙임 쪽 수
  landscapePages,                   // 가로 쪽 수
  overflow: [3, 9],                 // 넘친 쪽 번호
  bookmarks, links,                 // 책갈피 수, 내부 링크 수
  bytes,                            // PDF 크기
  browser,                          // 브라우저 제품 이름(예: HeadlessChrome/131.0…)
  problems: ['overflow: pages 3, 9'],   // 「코드: 설명」 문자열. 하나라도 있으면 build 는 종료 코드 1
}
```

- 재지 않은 수는 `null` 로 둔다.
- 문제 코드는 `overflow` · `pdf-size` · `svg-guard` · `missing-var` · `missing-file` 이다. 새 코드는 이 표에 먼저 더한다.
- `landscapePages` · `bookmarks` · `links` 는 구운 PDF 를 `inspectPdf` 로 다시 읽어 센다. `links` 는 문서 안 링크만 센다(바깥 주소 제외).
- pages 모드는 원고가 둘 이상이면 하나의 HTML 로 묶을 수 없어 `files.printHtml` 이 `null` 이다. 웹판은 book · spec 모드만 낸다.
- 넘친 쪽은 `allowOverflow` 가 아니면 문제다. 크기 상한을 넘으면 PDF 를 지운 뒤 문제로 적는다.

## 6. 쪽 나누기 스크립트가 알리는 값

`printPdf(cdp, html, { timeoutMs })`(`src/browser/print.mjs`)는 문서를 빈 쪽에 써 넣고 창 변수가 아래처럼 될 때까지 기다린다. 그래서 렌더가 넣는 쪽 나누기 스크립트(T2)는 이 값을 지켜야 한다.

| 변수 | 누가 쓰나 | 뜻 |
|---|---|---|
| `window.__TYPESET_LIMIT_MS__` | printPdf | 시간 상한을 직접 정할 때만 둔다. 스크립트는 있으면 이 값을 쓴다 |
| `window.__typesetLimitMs` | 스크립트 | 스크립트가 정한 시간 상한. printPdf 는 이 값 + 35초까지 기다린다 |
| `window.__paged` | 스크립트 | 끝나면(실패해도) `true` |
| `window.__err` | 스크립트 | 실패 까닭. 있으면 printPdf 는 PDF 를 굽지 않고 실패한다 |
| `window.__pageCount` | 스크립트 | 표지를 포함한 쪽 수 |
| `window.__frontCount` | 스크립트 | 표지 뒤 앞붙임 쪽 수. 쪽 번호 표기(표지 · 로마 숫자 · 아라비아 숫자)에 쓴다 |
| `window.__anchors` | 스크립트 | `{ 앵커: 쪽 번호 }` |
| `window.__overflow` | 스크립트 | 넘친 쪽 번호 목록 |

printPdf 는 `{ pdf, meta: { pages, front, anchors, err, overflow } }` 를 돌려준다. PDF 는 책갈피 옵션(`generateDocumentOutline`)을 켜고 스트림으로 받는다. 책갈피 창 열기 · 쪽 번호 표기 · 객체 스트림 저장은 그 뒤에 `applyPdfNav`(T3)가 한다.

브라우저 규칙은 다음과 같다. `withChrome` 이 지키므로 다른 레인은 브라우저를 직접 띄우지 않는다.

- `--headless=new` 로만 띄운다. 로컬 파일에 접근하게 하는 인자는 넣지 않는다.
- 임시 프로필을 쓰고, 끝나면(실패해도) 프로세스를 끄고 프로필을 지운다.
- 디버깅 포트는 0 으로 주고, 브라우저가 프로필의 `DevToolsActivePort` 에 적은 포트로 붙는다.
- 문서는 `file://` 로 열지 않는다.

## 7. check 의 결과

`checkPdfs(paths, options)` 는 `{ results, hasProblems }` 를 돌려준다. `results` 는 `[{ file, status: 'ok' | 'fail', problems: ['코드: 설명'], facts }]` 다. `facts` 에는 차례 줄 수 · 책갈피 수와 단계 · 링크 수 · 쪽 번호 표기 · 가로 쪽 수 · Type 3 글꼴 수 · 크기를 담는다. 명령은 `hasProblems` 가 참이면 종료 코드 1 로 끝낸다. `--json` 이면 결과를 그대로 낸다.

문제 코드는 다음과 같다.

| 코드 | 조건 |
|---|---|
| `page-mode` | `/PageMode` 가 `/UseOutlines` 가 아니다 |
| `no-bookmarks` · `bookmark-depth` · `bookmark-target` | 책갈피 없음 · 단계가 상한(기본 2)을 넘음 · 가리키는 쪽이 없음 |
| `dead-links` | 문서 안 링크의 목적지가 없다 |
| `toc-count` · `toc-target` · `toc-order` · `toc-body` | 차례 줄 수 ≠ 책갈피 수 · 줄 목적지 ≠ 책갈피 쪽 · 목적지가 줄어듦 · 차례 뒤 책갈피 없음 |
| `page-labels` | 차례가 있는데 쪽 번호 표기가 없거나 본문 첫 쪽의 표기가 `1` 이 아니다 |
| `type3-fonts` | Type 3 글꼴이 있다(`allowType3` 로 푼다) |
| `pdf-size` | 크기 상한을 넘는다 |
| `missing-file` · `unreadable` | 파일을 못 읽음 · PDF 가 아님 |

차례는 책갈피 맨 위 단계에서 `목차` · `차례` · `Contents` · `Table of Contents` 와 이름이 같은 항목으로 찾는다. 차례 쪽에 찍힌 숫자 자체는 읽지 않고, 차례 쪽 링크의 목적지와 책갈피 쪽을 견준다.

## 8. check-writing 의 결과

`checkWriting({ root, config, mode })` 의 `mode` 는 `report` · `check` · `update-baseline` 가운데 하나다. 돌려주는 값은 `{ findings, hasProblems, regressed, improved }` 다. `regressed` · `improved` 는 기준선보다 늘어난 칸 · 줄어든 칸(`[{ rule, file, was, now }]`)이다. 명령은 `check` 에서 늘어난 칸 없이 줄어든 칸만 있으면 재잠금(`--update-baseline`)을 안내한다. `findings` 는 `[{ file, line, rule, text, suggest, level }]` 이고, `file` 은 root 기준 `/` 경로다. `level` 은 그 규칙의 모드(`warn` · `ratchet` · `fail`)다. `hasProblems` 는 `fail` 규칙에 걸린 것이 있거나, `check` 에서 기준선보다 늘어난 칸이 있을 때 참이다.

## 9. 내장 글꼴 표

`BUILTIN_FONTS` 는 `{ 이름: { family, files: [{ path, weight, style }] } }` 다. `path` 는 패키지의 `fonts/` 폴더 기준이다. 설정의 `builtin:<이름>` 은 이 표의 이름을 가리킨다. `doctor` 는 이 표의 파일이 모두 있는지 본다. 이 파일이 아직 없으면 `doctor` 의 글꼴 항목은 실패로 나온다.

## 10. 오류 · 종료 코드 · 문구 언어

| 종료 코드 | 뜻 |
|---|---|
| 0 | 통과 |
| 1 | 굽기 · 검사 실패, 브라우저 없음, `doctor` 실패 항목 있음 |
| 2 | 인자 오류, 설정 오류, 없는 문서 id, 아직 없는 단계 |

- 라이브러리가 던지는 오류 문구는 영어다. 명령줄의 안내 문구는 `TYPESET_KIT_LANG` → `LC_ALL` → `LANG` 순서로 보고, `ko` 로 시작하면 한국어로 낸다.
- 문서 안에 찍히는 낱말(차례 · 그림 · 계속 등)은 명령줄 문구와 별개다. 설정 `locale` 의 언어 묶음(T2)에서 온다.
- 설정 오류는 `ConfigError.problems` 에 `{ path, code, expected, got }` 로 모두 담긴다. 코드는 `unknown-key` · `missing-key` · `wrong-type` · `not-allowed` · `out-of-range` · `no-match` · `duplicate-id` · `mode-key` · `invalid-json` · `config-not-found` 다.
