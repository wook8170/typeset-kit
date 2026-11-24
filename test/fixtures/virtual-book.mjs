// 가상 책 명세 — 조판 코어 테스트가 함께 쓰는 원고와 설정 변형. 내용은 가상의 회사(Acme) 안내서다.
// 부르는 곳: test/render/*, test/modes/spec.test.mjs, 특성화 기준값(test/fixtures/source-engine.json)을 만든 스크립트.
// 먼저 읽을 파일: docs/contract.md 「책 명세」 · 「블록」.
import { documentSettings } from '../../src/config/document.mjs'
import { validateConfig } from '../../src/config/validate.mjs'

const cols = (count, name) => Array.from({ length: count }, (_, i) => name(i))
const pad = (value) => String(value).padStart(3, '0')

/** 열 열 개짜리 표의 행. 첫 칸은 「태그-번호」라서 쪽마다 실린 행을 셀 수 있다. */
export const wideRows = (count, tag) =>
  Array.from({ length: count }, (_, r) => cols(10, (i) => (i === 0 ? `${tag}-${pad(r + 1)}` : `값 ${r + 1}·${i}`)))

const longRows = (count) =>
  Array.from({ length: count }, (_, r) => [`L-${pad(r + 1)}`, `설정 항목 ${r + 1}`, '기본값을 그대로 두면 서버가 시작할 때 이 값을 읽는다. 바꾸면 다시 시작해야 한다.'])

const SVG_WIDE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 260" role="img" aria-label="흐름">' +
  '<rect x="10" y="10" width="300" height="240" fill="#eef" stroke="#336"/><rect x="450" y="10" width="300" height="240" fill="#efe"/>' +
  '<line x1="310" y1="130" x2="450" y2="130" stroke="#333" stroke-width="2"/><text x="40" y="130" font-size="28">요청</text></svg>'
const SVG_SMALL =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><circle cx="100" cy="100" r="80" fill="#ddd"/><text x="200" y="110" font-size="20">구성</text></svg>'

function guideSections() {
  return [
    { no: '1.1', title: '준비', mono: 'prepare', blocks: [
      { t: 'lede', html: 'Acme 서버를 설치하기 전에 확인할 것을 정리한다.' },
      { t: 'p', html: '설치에는 <code>acme-server</code> 묶음과 <strong>관리자 계정</strong>이 필요하다. 아래 순서대로 확인한다.' },
      { t: 'steps', label: '확인 순서', items: ['운영체제 버전을 확인한다.', { html: '디스크 여유를 확인한다.', code: ['df -h /opt'], note: '20GB 이상이어야 한다.' }, '방화벽에서 <code>8080</code> 포트를 연다.'] },
      { t: 'callout', kind: 'note', html: '시험 서버에서는 방화벽 단계를 건너뛰어도 된다.' },
      { t: 'callout', kind: 'caution', html: '설치 도중에 서버를 다시 시작하지 않는다.' },
      { t: 'callout', kind: 'warning', html: '기존 데이터 폴더를 지우면 되돌릴 수 없다.' },
    ] },
    { no: '1.2', title: '설치 파일', blocks: [
      { t: 'h3', text: '파일 목록', sub: '묶음 안에 든 파일이다.' },
      { t: 'table', head: ['파일', '크기', '설명'], rows: [['<code>acme-server.tar.gz</code>', '120MB', '서버 본체'], ['<code>acme-cli</code>', '8MB', '명령줄 도구'], ['<code>CHECKSUMS</code>', '1KB', '파일 해시']], caption: '설치 파일', num: '1-1' },
      { t: 'defs', rows: [['설치 폴더', '<code>/opt/acme</code>'], ['<b>설정 파일</b>', '<code>/etc/acme/server.toml</code>']] },
      { t: 'code', lines: ['tar xzf acme-server.tar.gz -C /opt', 'sudo /opt/acme/bin/install --check'] },
      { t: 'cards', label: '요구 사양', items: [{ title: 'CPU', value: '4코어', note: '8코어 권장' }, { title: '메모리', value: '16GB' }, { title: '디스크', value: '200GB', note: 'SSD' }] },
      { t: 'figure', num: '1-1', svgText: SVG_SMALL, caption: '서버 구성' },
      { t: 'sources', html: '제품 설치 안내 2.1판' },
    ] },
    { no: '1.3', title: '설정 항목 전체', blocks: [
      { t: 'p', html: '아래 표는 설정 항목을 모두 보인다. 표가 길어서 여러 쪽에 나뉜다.' },
      { t: 'table', head: ['번호', '항목', '설명'], rows: longRows(46), caption: '설정 항목', num: '1-2' },
      { t: 'ul', items: Array.from({ length: 40 }, (_, i) => `점검 항목 ${i + 1} — 로그에 오류가 없는지 본다.`) },
    ] },
  ]
}

function wideSections() {
  return [
    { no: '2.1', title: '세로 절', blocks: [{ t: 'p', html: '세로 쪽 문단이다.' }] },
    { no: '2.2', title: '긴 가로 표', blocks: [
      { t: 'p', html: '아래 표는 열이 열 개다.' },
      { t: 'table', head: cols(10, (i) => `머리${i}`), rows: wideRows(37, 'A'), caption: '긴 가로 표', num: '2-1' },
    ] },
    { no: '2.3', title: '짧은 가로 표', blocks: [{ t: 'table', head: cols(10, (i) => `머리${i}`), rows: wideRows(3, 'B') }] },
    { no: '2.4', title: '넓은 그림', blocks: [{ t: 'figure', num: '2-1', svgText: SVG_WIDE, caption: '요청 흐름', fit: { mode: 'land', w: 1009, h: 232 } }] },
    { no: '2.5', title: '다시 세로', blocks: [{ t: 'p', html: '가로 묶음 뒤 문단이다.' }] },
  ]
}

const manySections = () =>
  Array.from({ length: 24 }, (_, i) => ({ no: `3.${i + 1}`, title: `점검 ${i + 1}`, blocks: [{ t: 'p', html: `점검 ${i + 1} 의 기준을 적는다.` }] }))

/** 가상 책 명세(계약 꼴). 앵커는 렌더가 붙인다. */
export function virtualSpec() {
  return {
    title: '서버 설치 안내서',
    subtitle: 'SERVER INSTALLATION',
    lede: 'Acme 서버를 처음 설치하는 운영 담당자를 위한 안내서다.',
    hue: 200,
    docInfo: {
      revisions: [['1.0', '2026-01-05', '처음 씀', 'Acme 문서팀'], ['1.1', '2026-03-10', '설정 항목 표를 더함', 'Acme 문서팀']],
      readers: ['서버 운영 담당자', '보안 점검 담당자'],
      related: [['DOC-02', '운영 안내서', '설치 뒤에 읽는다']],
      contact: [['메일', 'docs@example.com'], ['누리집', 'https://example.com']],
    },
    chapters: [
      { no: '1', title: '설치', summary: '서버를 설치하는 순서다.', facts: [{ label: '소요 시간', value: '30분', note: '네트워크에 따라 다르다' }, { label: '권한', value: '관리자' }, { label: '선행', value: '없음' }], sections: guideSections() },
      { no: '2', title: '넓은 자료', summary: '열이 많은 표와 넓은 그림이다.', sections: wideSections() },
      { no: '3', title: '점검 목록', sections: manySections() },
      { no: 'A', label: '부록', title: '포트 목록', sections: [{ no: '부록 A', title: '포트', blocks: [{ t: 'table', head: ['포트', '용도'], rows: [['8080', '웹'], ['5432', '데이터베이스']] }] }] },
    ],
  }
}

const BASE_CONFIG = {
  brand: { name: 'Acme Docs', publisher: 'Acme Inc.', contact: 'https://example.com' },
  cover: { meta: [['문서번호', 'DOC-01'], ['적용 버전', '2.1'], ['배포 등급', '공개']], topics: ['설치 준비', '설치 파일', '설정 항목'] },
}

/** 설정 변형. 각 변형은 설정 덮어쓰기와, 스키마에 아직 없는 typeset 키(extraTypeset)다. */
export const VARIANTS = Object.freeze({
  plain: { config: {}, extraTypeset: {} },
  options: {
    config: { typeset: { tableFillSplit: 3, landTables: 'auto', landTableMinCols: 8, fitFigures: true, sectionListMax: 20 }, cover: { approvalBox: ['작성', '검토', '승인'] } },
    extraTypeset: { tableColWidths: 'content', splitSectionList: true },
  },
  landscape: {
    config: { theme: { page: { orientation: 'landscape' } }, typeset: { tableFillSplit: 3 } },
    extraTypeset: { tableColWidths: 'content' },
  },
})

/** 변형 이름 → 렌더가 받는 settings 한 벌(documentSettings 의 결과에 extraTypeset 을 더한 것). */
export function variantSettings(name, extraConfig = {}) {
  const variant = VARIANTS[name]
  const raw = {
    ...BASE_CONFIG,
    ...variant.config,
    ...extraConfig,
    cover: { ...BASE_CONFIG.cover, ...variant.config.cover, ...extraConfig.cover },
    documents: [{ id: 'guide', mode: 'spec', src: 'guide.mjs' }],
  }
  const { config, problems } = validateConfig(raw)
  if (problems.length) throw new Error(`fixture config is invalid: ${JSON.stringify(problems)}`)
  const settings = documentSettings(config, config.documents[0])
  return { ...settings, typeset: { ...settings.typeset, ...variant.extraTypeset } }
}
