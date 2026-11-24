// 가로 판형 — 책 전체를 A4 가로로 짤 때의 덮어쓰기 CSS와, 쪽을 넘는 표의 「(계속)」 표시.
// 부르는 곳: render/styles.mjs(문서 CSS 끝에 붙인다), render/blocks.mjs(표 블록의 data-cont).
// 먼저 읽을 파일: render/paginator.mjs 의 pageChromeCss(쪽 크기 · 쪽 크롬은 그쪽이 정한다).

/** 책 전체가 가로인가(settings.theme.page.orientation). */
export const isLandBook = (settings) => settings?.theme?.page?.orientation === 'landscape'

/** 가로 판형 덮어쓰기 CSS. 세로 쪽 기준으로 자리를 잡은 표지 · 장 표지 · 그림 상한만 가로 쪽에 맞게 다시 준다. */
export function landBookCss() {
  return `
/* ── 책 전체 가로 ─────────────────────────────────────── */
/* 표지: 왼쪽에 제목 · 요약, 아래 왼쪽에 다루는 것, 오른쪽에 문서 정보와 결재 칸. */
.cvmain{top:112px;right:500px}
.cvbottom,.cvbottom:has(.cvappr){bottom:92px;grid-template-columns:minmax(0,1fr) 300px;gap:64px}
.cvtopics{grid-row:1/span 2;align-self:end}
/* 장 표지: 세로 쪽보다 높이가 낮아 위 여백과 사실 칸 간격을 줄인다. */
.chopener{padding-top:36px}
.copfacts{margin-top:28px}
.copseclabel{margin-top:24px}
.copsum{max-width:760px}
/* 그림: 본문 높이가 646px 라서 캡처 높이 상한을 캡션 자리만큼 뺀 540px 로 둔다. */
.bfigframe img{max-height:540px}
.bfigsvg svg{max-height:580px}
`
}

/**
 * 표 블록의 data-cont 속성. 번호가 있으면 「표 9-1 (계속)」, 없으면 「(계속)」이다.
 * 쪽 나누기 스크립트(contMark)가 뒤 조각에 btblcont 를 달면 CSS 가 이 글을 머리글 위에 그린다.
 */
export function contAttr(block, words, escape) {
  const label = block.num ? `${words.table} ${escape(block.num)} ` : ''
  return ` data-cont="${label}${words.continued}"`
}

/** 이어지는 조각 표시 CSS. 표 캡션과 같은 글자 크기 · 색을 쓴다. */
export function landContCss(ink3) {
  return `\n.btblcont::before{content:attr(data-cont);display:block;font-size:11px;font-weight:600;color:${ink3};margin:0 0 6px}`
}
