# fonts — 내장 글꼴과 글꼴 CSS

설정의 `theme.fonts` 가 가리키는 글꼴을 문서 HTML 에 넣을 `@font-face` 규칙으로 바꾼다.

## 들어오는 곳

조판 모드가 `fontCss(fontSpecs, { root })` 를 부른다. `doctor` 는 `BUILTIN_FONTS` 표의 파일이 모두 있는지 본다.

## 거치는 순서

1. `builtin.mjs` — `builtin:<이름>` 을 파일 목록(`fonts/` 폴더 기준)으로 풀어 주는 표다.
2. `css.mjs` — 파일을 읽어 base64 데이터 주소로 담는다. 같은 글꼴은 한 번만 넣는다. 파일이 없으면 시스템 글꼴로 넘어가지 않고 오류로 멈춘다.

## 글꼴 파일

`fonts/` 폴더에 Noto Sans KR 와 JetBrains Mono 의 400 · 700 고정 굵기 파일이 있다. 출처 · 해시 · 만든 방법은 `fonts/FONTS.md`, 라이선스는 `fonts/OFL-*.txt` 와 `THIRD-PARTY-NOTICES.md` 에 있다. 파일을 다시 만들려면 `scripts/gen-fonts.py` 를 쓴다. 같은 설계로 가변 글꼴과 PDF 를 견주려면 `scripts/measure-fonts.mjs` 를 쓴다.

## 먼저 읽을 파일

`css.mjs`, `fonts/FONTS.md`.
