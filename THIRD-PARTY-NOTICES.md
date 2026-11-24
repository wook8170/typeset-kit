# Third-party notices

typeset-kit 의 코드는 MIT 라이선스(`LICENSE`)다. 아래 항목은 패키지에 함께 들어가는 글꼴과 의존이며 각자의 라이선스를 따른다.

## 글꼴 (`fonts/`)

| 글꼴 | 파일 | 저작권 | 라이선스 | 수정 여부 |
|---|---|---|---|---|
| Noto Sans KR | `NotoSansKR-400.woff2` `NotoSansKR-700.woff2` | Copyright 2014-2021 Adobe | SIL Open Font License 1.1 (`fonts/OFL-NotoSansKR.txt`) | 수정본. 굵기 400 · 700 고정 인스턴스에서 한글 음절 · 라틴 · 기호만 남긴 부분 집합 |
| JetBrains Mono | `JetBrainsMono-400.woff2` `JetBrainsMono-700.woff2` | Copyright 2020 The JetBrains Mono Project Authors | SIL Open Font License 1.1 (`fonts/OFL-JetBrainsMono.txt`) | 수정 없음. `@fontsource/jetbrains-mono` 5.2.8 의 라틴 woff2 를 그대로 복사 |

- Noto Sans KR 의 원본은 google/fonts 저장소 커밋 `6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec` 의 `ofl/notosanskr/NotoSansKR[wght].ttf` 다. 예약 글꼴 이름은 「Source」 하나라서 수정본도 원래 이름을 쓴다.
- 만든 방법과 파일별 sha256 은 `fonts/FONTS.md` 와 `scripts/gen-fonts.py` 에 있다.
- 글꼴을 따로 팔지 않는다. 글꼴 파일을 다시 배포할 때는 해당 OFL 전문과 저작권 표시를 함께 둔다.
- 이 글꼴로 만든 PDF 는 OFL 의 적용 대상이 아니다.

## 의존

| 패키지 | 버전 | 라이선스 |
|---|---|---|
| pdf-lib | 1.17.1 | MIT |

> **미확인**: T5 가 `marked` 를 넣으면 이 표에 더한다. `pdf-lib` 의 저작권 표시 문구는 배포 전에 설치본의 `LICENSE` 와 대조한다.
