# 내장 글꼴

기본 테마가 쓰는 글꼴 네 개다. 모두 SIL Open Font License 1.1(OFL) 로 배포되는 글꼴이다. 전문은 `OFL-NotoSansKR.txt` 와 `OFL-JetBrainsMono.txt` 에 있다. 저장소의 `LICENSE`(MIT)는 코드에만 해당하고, 이 폴더의 글꼴에는 OFL 이 적용된다.

| 파일 | 크기(바이트) | sha256 |
|---|---|---|
| `NotoSansKR-400.woff2` | 560,692 | `5dfe3e504c475a014f099013f584cfc72543e2ee7d2b1281413238b1d4e843ec` |
| `NotoSansKR-700.woff2` | 578,176 | `15a852b42370268e673c16a621e383c13969be31e0f45b9ea113ce8892160051` |
| `JetBrainsMono-400.woff2` | 21,168 | `14425ba9c695763c1547f48a206b7aa60350a33ae23de09f0407877f3fcd89eb` |
| `JetBrainsMono-700.woff2` | 21,908 | `d0d4e818808f2a0ba39b2b09d1989366f63494e295f003c7ef436697378507e8` |

## Noto Sans KR 400 · 700

- 저작권: Copyright 2014-2021 Adobe. 예약 이름은 「Source」 하나이므로 수정본도 「Noto Sans KR」 이름을 쓴다.
- 원본: google/fonts 저장소 커밋 `6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec` 의 `ofl/notosanskr/NotoSansKR[wght].ttf`(sha256 `194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252`).
- 수정 내용: 가변 글꼴에서 굵기 400 · 700 의 고정 인스턴스를 만들고(fontTools 4.58.1 `instancer`), 아래 글자만 남기는 부분 집합으로 줄였다. 힌팅을 뺐다.
  - 라틴 · 라틴 보충, 일반 문장 부호, 화살표 · 수학 기호 · 도형 · 원문자, CJK 기호, 호환 자모, 한글 음절 11,172자 전부, 전각 ASCII, `℃` `№` `™`
  - 레이아웃 기능은 `tnum` `kern` `liga` `calt` `ccmp` `locl` 만 남겼다.
- 인스턴스 입력의 sha256: 400 = `15873fc7dc038d31336a653ec4dd092b4b6b2405922e553d9e893de5913afedf`, 700 = `a5fb5387c5868b5ed73a160827bdcd2513271ef8ec573c771b83201a90d1c86a`.
- 한글 음절을 2,350자(KS X 1001)로 줄이지 않았다. 드문 음절이 빈 네모로 찍히지 않게 하기 위해서다. PDF 에는 쓴 글자만 들어가므로 PDF 크기는 늘지 않는다.

## JetBrains Mono 400 · 700

- 저작권: Copyright 2020 The JetBrains Mono Project Authors. 예약 이름 없음.
- 원본: npm 패키지 `@fontsource/jetbrains-mono` 5.2.8 의 `files/jetbrains-mono-latin-400-normal.woff2` · `-700-normal.woff2`. 라틴 부분 집합이며 바이트를 바꾸지 않고 복사했다. 입력과 결과의 sha256 이 같다.

## 다시 만드는 방법

```
pip install fonttools brotli
python3 scripts/gen-fonts.py --noto-regular <NotoSansKR-Regular.ttf> --noto-bold <NotoSansKR-Bold.ttf> \
    --jetbrains-dir <jetbrains-mono-latin-*-normal.woff2 가 든 폴더>
```

같은 입력이면 같은 바이트가 나온다(`recalcTimestamp=False`). 출력의 sha256 이 위 표와 같은지 확인한다.

## 다른 글꼴을 쓰려면

설정의 `theme.fonts` 에 `{ family, files: [{ path, weight, style }] }` 를 준다. 가변 글꼴도 쓸 수 있다. 다만 Chrome 은 가변 글꼴을 PDF 에 Type 3 글꼴로 넣어 파일이 커지고 `check` 가 경고한다. 이 폴더의 고정 굵기 글꼴은 400 · 700 두 굵기만 있어서, 500 · 600 · 800 으로 지정한 글자는 가장 가까운 400 또는 700 으로 그려진다.
