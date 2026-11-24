// 한국어 낱말 묶음 — 조판 문서 안에 찍히는 낱말(차례 · 그림 · 표 · 계속 등)과 한국어 줄바꿈 규칙.
// 부르는 곳: render/locale/index.mjs(설정 locale 로 고른다).
// 먼저 읽을 파일: render/locale/en.mjs(같은 키를 가진다. 키를 더하면 두 파일에 함께 더한다).

export default Object.freeze({
  lang: 'ko',
  // 한국어는 낱말 중간에서 줄을 바꾸지 않는다
  wordBreak: 'keep-all',
  figure: '그림',
  table: '표',
  continued: '(계속)',
  sources: '근거',
  appendix: '부록',
  coverLabel: '표지',
  coverTopics: '이 문서에서 다루는 것',
  approvalSign: '이름 / 서명',
  approvalDate: '날짜',
  docInfoEyebrow: 'DOCUMENT INFORMATION',
  docInfoTitle: '문서 정보',
  revisions: '개정 이력',
  revisionHead: ['판', '일자', '변경 내용', '작성'],
  readers: '대상 독자',
  related: '관련 문서',
  relatedHead: ['문서번호', '문서명', '이 문서와의 관계'],
  contact: '문의처',
  tocEyebrow: 'CONTENTS',
  tocTitle: '목차',
  chapterSections: '이 장의 절',
  chapterSectionCount: (count) => `이 장의 절 ${count}개는 차례에서 볼 수 있다.`,
  callouts: { note: '참고', caution: '주의', warning: '경고' },
  conventions: (callout) =>
    `<b>표기 규칙</b> — <span class="convcode">코드</span> 는 그대로 입력하는 명령·경로, ` +
    `<b>굵게</b> 는 화면의 버튼·메뉴 이름, 「 」 는 화면 문구입니다. ` +
    `<span class="convref">${callout.note}</span> · <span class="convcau">${callout.caution}</span> · ` +
    `<span class="convwarn">${callout.warning}</span> 상자는 순서대로 ` +
    `알아두면 좋은 것 · 놓치면 되돌리기 어려운 것 · 데이터 손실 위험을 뜻합니다.`,
})
