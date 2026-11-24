# typeset-kit

Markdown 원고 · 책 명세 · 쪽 HTML 을 차례 · 내부 링크 · 책갈피가 있는 PDF 로 굽는 명령줄 도구다. 같은 원고로 쪽을 나누지 않는 웹판 HTML 도 만든다. 헤드리스 Chrome(또는 Edge)으로 굽고, 글꼴과 그림을 문서 안에 넣어 바깥 요청 없이 같은 결과를 낸다.

[English](README.md)

## 필요한 것

- Node.js 22 이상
- Chrome 또는 Edge
  - 데스크톱: 설치된 Chrome 이나 Edge 를 찾아 쓴다. Windows 에는 Edge 가 기본으로 있다.
  - 서버 · CI: `npx @puppeteer/browsers install chrome-headless-shell@stable` 로 받은 뒤 `CHROME_BIN` 에 실행 파일 경로를 준다.
  - 폐쇄망: 위 명령으로 받은 폴더를 반입하고 `CHROME_BIN` 을 준다.

poppler · Python 은 필요 없다.

## 시작하기

```sh
npx typeset-kit init            # 설정(typeset.config.mjs)과 예제 원고(docs/)를 만든다. 영어 예제는 --locale en
npx typeset-kit doctor          # Node · 브라우저 · 책갈피 지원 · 글꼴 · 설정을 점검한다
npx typeset-kit build --pdf --web
npx typeset-kit check typeset-out/guide.pdf
```

결과는 `typeset-out/` 에 생긴다.

| 파일 | 내용 |
|---|---|
| `guide.pdf` | 표지 · 문서 정보 · 차례 · 본문. 차례 줄은 내부 링크, 장 › 절은 책갈피 2단계. 열면 책갈피 창이 펴진다 |
| `guide.html` | PDF 를 굽기 직전의 인쇄판 HTML |
| `guide.web.html` | 웹판. 옆 차례, 좁은 화면의 접는 차례, 밝은 · 어두운 테마. 스크립트가 없다 |
| `typeset-report.json` | 문서마다 쪽 수 · 앞붙임 쪽 수 · 넘친 쪽 · 책갈피 수 · 링크 수 · 크기 |

패키지의 `examples/` 폴더에 예제가 세 가지 있다. `ko` 는 짧은 안내서, `en` 은 영어 문서(`init` 이 이 둘을 복사한다), `report` 는 표와 그림이 많은 보고서다. `report` 는 폴더를 통째로 복사해 그 안에서 `build` 를 돌린다.

## 명령

| 명령 | 하는 일 | 종료 코드 |
|---|---|---|
| `build [문서 id…]` | 설정의 문서를 굽는다. `--pdf` · `--web` · `--html-only` 로 출력을 고른다. 아무것도 주지 않으면 PDF 와 인쇄판 HTML | 넘친 쪽 · 크기 상한 초과 · 없는 파일 · SVG 허용 목록 위반이면 1 (`--allow-overflow` 로 넘친 쪽을 허용) |
| `check <pdf…>` | 차례 줄 수 = 책갈피 수, 링크 목적지, 책갈피 단계, 쪽 번호 표기, 책갈피 창, Type 3 글꼴, 크기. `--require-toc` 를 주면 차례가 없는 PDF 도 실패다 | 기준 미달이면 1 |
| `check-writing` | 글쓰기 규칙. `--check` 는 기준선 대조, `--update-baseline` 은 재잠금 | 기준선보다 늘면 1 |
| `doctor` | 굽기 환경 점검 | 굽지 못할 상태면 1 |
| `init` | 설정과 예제 원고 | 이미 있으면 1 (`--force` 로 덮어쓴다) |

인자 · 설정 오류는 종료 코드 2 다. 명령줄 문구는 `TYPESET_KIT_LANG` → `LC_ALL` → `LANG` 이 `ko` 로 시작하면 한국어로 나온다.

## 입력 세 가지

| 모드 | 입력 | 쓰는 곳 |
|---|---|---|
| `book` | Markdown 파일 하나 또는 여럿 | 안내서 · 보고서 · 백서 |
| `spec` | 책 명세(`.mjs` 기본 내보내기 또는 `.json`) | 블록을 직접 쓰는 문서 |
| `pages` | 판형대로 짠 HTML 여러 장 | 브로셔 · 소책자. 면마다 구워 한 권으로 합친다 |

### Markdown 원고 쓰는 법

- `#` 문서 제목, `##` 장, `###` 절, `####` 소제목. 장 · 절은 차례와 책갈피에 들어가고 번호는 자동으로 붙는다.
- `#` 아래 첫 `##` 앞의 문단은 표지 요약, `##` 바로 아래 첫 문단은 장 표지 요약이 된다.
- 인용문 첫 낱말을 굵게 쓰면 콜아웃이 된다: `> **주의** …`. 종류는 참고 · 주의 · 경고(영어 문서는 Note · Caution · Warning)다.
- 문단에 그림 하나만 두면 그림 블록이 된다: `![캡션](figures/a.svg)`. SVG 는 문서에 그대로 넣어 그림 안 글자도 내장 글꼴로 보인다. 긴 변이 `limits.imageMaxPx`(기본 2000) 를 넘는 PNG 는 줄여서 넣는다. 바깥 주소의 그림과 프로젝트 폴더(설정 파일이 있는 폴더) 밖의 파일은 받지 않는다.
- 표는 GFM 표, 코드는 울타리 코드 블록이다. 번호 목록 안의 코드 블록은 그 항목 아래 코드 상자가 된다.
- 원고에 쓴 HTML 은 글자로 보인다. 링크는 `http` · `https` · `mailto` · `#` 만 눌리는 링크로 남는다.

전체 규칙은 [docs/contract.md](docs/contract.md) 4.3절에 있다.

## 설정

저장소 루트의 `typeset.config.mjs`(또는 `.json`) 하나다. 모르는 키는 오류로 알린다. 그래서 설정에 오타가 있으면 굽기 전에 알 수 있다.

```js
export default {
  locale: 'ko',
  outDir: 'typeset-out',
  brand: { name: 'Acme Docs', logo: 'assets/mark.svg', publisher: 'Acme Inc.', contact: 'https://example.com' },
  theme: { hue: 250, fonts: { sans: 'builtin:noto-sans-kr', mono: 'builtin:jetbrains-mono' } },
  cover: { meta: [['문서번호', 'DOC-01']], approvalBox: ['작성', '검토', '승인'] },
  footer: { left: '{brand} {title} · {edition}', right: '{page}' },
  typeset: { landTables: 'auto', tableColWidths: 'content' },
  documents: [
    { id: 'install', mode: 'book', src: 'docs/install.md', revisions: 'docs/install.revisions.json' },
    { id: 'brochure', mode: 'pages', src: 'brochure/*.html', vars: { VERSION: '2.1.0' }, toc: true },
  ],
  writing: { languages: ['ko'] },
}
```

키 전체와 기본값은 [docs/contract.md](docs/contract.md) 2절에 있다. 문서마다 `theme` · `cover` · `header` · `footer` · `typeset` 을 덮어쓸 수 있다.

## 글꼴

기본 글꼴은 패키지에 들어 있다. Noto Sans KR 과 JetBrains Mono 를 굵기 400 · 700 두 벌로 넣었다. 가변 글꼴을 그대로 넣으면 Chrome 이 PDF 에 Type 3 글꼴로 넣어 파일이 커지기 때문이다. 기본 테마도 굵기 400 · 700 만 쓴다.

다른 글꼴은 `theme.fonts` 에 파일을 준다: `{ family: 'My Sans', files: [{ path: 'fonts/my-400.woff2', weight: 400 }] }`. 글꼴 파일이 없으면 굽기가 실패한다. 시스템 글꼴로 조용히 바뀌면 머신마다 결과가 달라지기 때문이다.

## 글쓰기 검사

`check-writing` 은 과장 · 비유 · AI 작성 흔적 · 억지 번역 · 사물 의인화 · 명사 이어 붙이기를 찾는다. 기준선을 잠가 두면 새로 늘어난 것만 실패로 알리고, 줄었으면 재잠금을 안내한다. 규칙 묶음마다 `off` · `warn` · `ratchet` · `fail` 을 고른다.

연결 단어가 빠진 문장과 짝이 되는 말이 멀리 떨어진 문장은 기계로 잡기 어렵다. 이 둘은 사람이 다시 읽어 고친다.

## Windows

Windows · macOS · Linux 에서 같은 명령으로 쓴다. 브라우저는 `%ProgramFiles%` · `%LocalAppData%` 의 Chrome, 그다음 Edge 를 찾는다. 외부 명령(`pdfunite` 등)을 쓰지 않는다.

## 라이선스

코드는 MIT(`LICENSE`)다. 함께 들어 있는 글꼴은 SIL Open Font License 1.1 이고, 출처와 만든 방법은 `fonts/FONTS.md`, 의존 목록은 `THIRD-PARTY-NOTICES.md` 에 있다.
