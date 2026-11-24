// 영어 낱말 묶음 — 조판 문서 안에 찍히는 낱말(차례 · 그림 · 표 · 계속 등)과 영어 줄바꿈 규칙.
// 부르는 곳: render/locale/index.mjs(설정 locale 로 고른다).
// 먼저 읽을 파일: render/locale/ko.mjs(같은 키를 가진다. 키를 더하면 두 파일에 함께 더한다).

export default Object.freeze({
  lang: 'en',
  // 영어는 낱말 사이에서만 줄을 바꾸는 기본 규칙을 쓴다
  wordBreak: 'normal',
  figure: 'Figure',
  table: 'Table',
  continued: '(continued)',
  sources: 'Sources',
  appendix: 'Appendix',
  coverLabel: 'Cover',
  coverTopics: 'In this document',
  approvalSign: 'Name / signature',
  approvalDate: 'Date',
  docInfoEyebrow: 'DOCUMENT INFORMATION',
  docInfoTitle: 'Document information',
  revisions: 'Revision history',
  revisionHead: ['Version', 'Date', 'Changes', 'Author'],
  readers: 'Intended readers',
  related: 'Related documents',
  relatedHead: ['Number', 'Title', 'Relation to this document'],
  contact: 'Contact',
  tocEyebrow: 'CONTENTS',
  tocTitle: 'Contents',
  chapterSections: 'Sections in this chapter',
  chapterSectionCount: (count) => `This chapter has ${count} sections. See the contents for the list.`,
  callouts: { note: 'Note', caution: 'Caution', warning: 'Warning' },
  conventions: (callout) =>
    `<b>Conventions</b> — <span class="convcode">code</span> is a command or path to type as shown, ` +
    `<b>bold</b> is a button or menu name, and quoted text is wording on the screen. ` +
    `<span class="convref">${callout.note}</span>, <span class="convcau">${callout.caution}</span> and ` +
    `<span class="convwarn">${callout.warning}</span> boxes mean, in order: good to know, hard to undo if missed, ` +
    `and risk of data loss.`,
})
