// 표와 그림이 많은 보고서 예제의 설정. 이 폴더에서 `npx typeset-kit build --pdf --web` 로 굽는다.
export default {
  locale: 'ko',
  outDir: 'typeset-out',
  brand: { name: 'Acme Support', publisher: 'Acme Inc.', contact: 'https://example.com' },
  cover: { meta: [['문서번호', 'RPT-2026-Q3'], ['기간', '2026-07 ~ 2026-09']] },
  // 열이 여덟 개 이상인 표는 가로 쪽에 싣고, 열 폭은 칸 글 길이로 잰다. 쪽 끝에 세 행 이상 들어가면 표를 거기서부터 싣는다.
  typeset: { landTables: 'auto', tableColWidths: 'content', tableFillSplit: 3 },
  documents: [
    { id: 'report', mode: 'book', src: 'docs/report.md', title: '3분기 문의 처리 보고서', revisions: 'docs/report.revisions.json' },
  ],
  writing: { languages: ['ko'] },
}
