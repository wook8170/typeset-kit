// 앞붙임과 장 표지 — 표지 · 결재 칸 · 문서 정보 · 차례 · 장 표지 HTML 과, 개정 이력에서 발행 정보를 뽑는 deriveIssue.
// 부르는 곳: render/index.mjs(인쇄판 HTML 을 짤 때).
// 먼저 읽을 파일: docs/contract.md 「책 명세」(docInfo · chapters), 「설정 계약」(cover · brand).

import { INK } from '../theme/index.mjs'
import { escapeAttr, escapeHtml } from './blocks.mjs'

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 개정 이력([버전, YYYY-MM-DD, 변경 내용, 작성] 목록)의 가장 늦은 날짜 행에서 발행 정보를 뽑는다(순수 함수).
 * 돌려주는 값 = { issued: 'YYYY-MM-DD', month: 'YYYY.MM', edition: 'YYYY.MM · 버전' }. 날짜 행이 없으면 모두 빈 글이다.
 */
export function deriveIssue(revisions = []) {
  const dated = revisions.filter((row) => DATE.test(row[1]))
  if (!dated.length) return { issued: '', month: '', edition: '' }
  const last = dated.reduce((latest, row) => (row[1] >= latest[1] ? row : latest))
  const month = last[1].slice(0, 7).replace('-', '.')
  return { issued: last[1], month, edition: `${month} · ${last[0]}` }
}

/** 결재 칸. 칸 이름은 설정 cover.approvalBox 의 낱말이고, 내용은 비워 두어 제출 때 손으로 서명한다. */
function approvalBox(roles, words) {
  return (
    `<table class="cvappr"><thead><tr>${roles.map((role) => `<th>${escapeHtml(role)}</th>`).join('')}</tr></thead><tbody>` +
    `<tr class="cvsign">${roles.map(() => `<td><span class="cvapl">${escapeHtml(words.approvalSign)}</span></td>`).join('')}</tr>` +
    `<tr class="cvdate">${roles.map(() => `<td><span class="cvapl">${escapeHtml(words.approvalDate)}</span></td>`).join('')}</tr>` +
    `</tbody></table>`
  )
}

function coverTopics(topics, words) {
  if (!topics.length) return '<div class="cvtopics"></div>'
  const rows = topics
    .map((topic, i) => `<div class="cvrow"><span class="cvn">${String(i + 1).padStart(2, '0')}</span><span class="cvt">${escapeHtml(topic)}</span></div>`)
    .join('')
  return `<div class="cvtopics"><div class="cvtopicsh">${escapeHtml(words.coverTopics)}</div>${rows}</div>`
}

/**
 * 표지(쪽 크롬 없음). page = { spec, settings, words, issue, logoSvg }.
 * 마크는 brand.logo 의 SVG(검사를 거친 글)이고, 없으면 마크 자리를 비운다. 메타 칸은 설정 cover.meta 의 [이름, 값] 쌍이다.
 */
export function coverHtml({ spec, settings, words, issue, logoSvg }) {
  const { brand, cover } = settings
  const mark = logoSvg ? `<div class="cvmark">${logoSvg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>` : ''
  const meta = cover.meta.map(([key, value]) => `<div class="cvk">${escapeHtml(key)}</div><div class="cvv">${escapeHtml(value)}</div>`).join('')
  const approval = cover.approvalBox ? approvalBox(cover.approvalBox, words) : ''
  const publisher = [brand.publisher, brand.contact].filter(Boolean).map(escapeHtml).join(' · ')
  return `<div class="page cover"><div class="cvband"></div>
  <div class="cvhead">
    <div class="cvbrand">${mark}<div class="cvname">${escapeHtml(brand.name)}</div></div>
    <div class="cvrev">${escapeHtml(issue.edition)}</div>
  </div>
  <div class="cvmain">
    <div class="cvtitles"><div class="cvtitle">${escapeHtml(spec.title)}</div><div class="cven">${escapeHtml(spec.subtitle ?? '')}</div></div>
    <div class="cvrule"></div>
    <div class="cvlede">${spec.lede ?? ''}</div>
  </div>
  <div class="cvbottom">
    ${coverTopics(cover.topics, words)}
    <div class="cvmeta">${meta}</div>${approval}
  </div>
  <div class="cvfoot"><div>${publisher}</div><div></div></div>
  </div>`
}

function revisionTable(revisions, words) {
  const rows = revisions
    .map((row) => `<tr><td class="cmono">${escapeHtml(row[0])}</td><td class="cmono">${escapeHtml(row[1])}</td><td>${row[2]}</td><td>${escapeHtml(row[3])}</td></tr>`)
    .join('')
  const head = words.revisionHead.map((name) => `<th>${escapeHtml(name)}</th>`).join('')
  return (
    `<div class="blabel">${escapeHtml(words.revisions)}</div>` +
    `<div class="btblwrap"><table class="btbl"><colgroup><col style="width:62px"><col style="width:104px"><col><col style="width:96px"></colgroup>` +
    `<thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
  )
}

function relatedTable(related, words) {
  const rows = related
    .map((row) => `<tr><td class="cmono">${escapeHtml(row[0])}</td><td class="cstrong">${escapeHtml(row[1])}</td><td>${row[2]}</td></tr>`)
    .join('')
  const head = words.relatedHead.map((name) => `<th>${escapeHtml(name)}</th>`).join('')
  return (
    `<div class="blabel">${escapeHtml(words.related)}</div>` +
    `<div class="btblwrap"><table class="btbl"><colgroup><col style="width:96px"><col style="width:132px"><col></colgroup>` +
    `<thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
  )
}

/** 문서 정보 쪽 — 개정 이력 · 대상 독자 · 관련 문서 · 문의처. 명세에 있는 항목만 싣는다. */
export function docInfoHtml(docInfo, words) {
  const parts = [
    `<div class="dieyebrow">${escapeHtml(words.docInfoEyebrow)}</div><div class="dititle" id="docinfo" role="heading" aria-level="1">${escapeHtml(words.docInfoTitle)}</div>`,
    docInfo.revisions ? revisionTable(docInfo.revisions, words) : '',
    docInfo.readers ? `<div class="blabel">${escapeHtml(words.readers)}</div><ul class="bul">${docInfo.readers.map((reader) => `<li>${reader}</li>`).join('')}</ul>` : '',
    docInfo.related ? relatedTable(docInfo.related, words) : '',
    docInfo.contact
      ? `<div class="blabel">${escapeHtml(words.contact)}</div><div class="bdefs">${docInfo.contact.map(([key, value]) => `<div class="bdk">${escapeHtml(key)}</div><div class="bdv">${value}</div>`).join('')}</div>`
      : '',
  ]
  return `<div data-break="before" data-solo="1" data-front="1">${parts.join('')}</div>`
}

/** 부록 번호(낱말 「부록」으로 시작)는 번호 칸을 넓힌다. */
const appendixClass = (no, words) => (String(no).startsWith(words.appendix) ? ' apx' : '')

/** 차례 — 장 · 절 2단계. 줄마다 해당 쪽으로 가는 링크(PDF 내부 링크)이고, 쪽 번호는 조판 뒤 채운다(data-tocref). */
export function tocHtml(spec, words) {
  let rows = ''
  for (const chapter of spec.chapters) {
    const anchor = escapeHtml(chapter.anchor)
    rows +=
      `<a class="tocch" href="#${anchor}"><span class="tocn">${escapeHtml(chapter.label || chapter.no)}</span>` +
      `<span class="toct">${escapeHtml(chapter.title)}</span><span class="tocdots"></span>` +
      `<span class="tocp" data-tocref="${anchor}">00</span></a>`
    for (const section of chapter.sections) {
      const sectionAnchor = escapeHtml(section.anchor)
      rows +=
        `<a class="tocsec" href="#${sectionAnchor}"><span class="tocsn${appendixClass(section.no, words)}">${escapeHtml(section.no)}</span>` +
        `<span class="tocst">${escapeHtml(section.title)}</span><span class="tocdots"></span>` +
        `<span class="tocsp tocp" data-tocref="${sectionAnchor}">00</span></a>`
    }
  }
  const conventions = `<div class="convbox">${spec.conventions ?? words.conventions(words.callouts)}</div>`
  return (
    `<div data-break="before" data-front="1">` +
    `<div class="dieyebrow">${escapeHtml(words.tocEyebrow)}</div><div class="dititle" id="contents" role="heading" aria-level="1">${escapeHtml(words.tocTitle)}</div>${rows}${conventions}</div>`
  )
}

function chapterSectionList(chapter, words, sectionListMax) {
  if (sectionListMax && chapter.sections.length > sectionListMax) {
    return `<div class="copseclabel" style="padding-bottom:8px;border-bottom:1.5px solid ${INK}">${escapeHtml(words.chapterSectionCount(chapter.sections.length))}</div>`
  }
  const rows = chapter.sections
    .map((section) => {
      const anchor = escapeHtml(section.anchor)
      return (
        `<a class="coprow" href="#${anchor}"><span class="copsn${appendixClass(section.no, words)}">${escapeHtml(section.no)}</span>` +
        `<span class="copst">${escapeHtml(section.title)}</span>` +
        `<span class="tocdots"></span><span class="copsp tocp" data-tocref="${anchor}">00</span></a>`
      )
    })
    .join('')
  return rows ? `<div class="copseclabel">${escapeHtml(words.chapterSections)}</div><div class="copsecs">${rows}</div>` : ''
}

/** 장 표지 한 쪽 — 번호 · 제목 · 요약 + 사실 칸 + 절 목록. 장 머리 = 책갈피 1단계. */
export function chapterOpenerHtml(chapter, { words, outlineSpace, sectionListMax }) {
  const facts = (chapter.facts || [])
    .map(
      (fact) =>
        `<div class="copfact"><div class="copfl">${escapeHtml(fact.label)}</div>` +
        `<div class="copfv">${fact.value}</div><div class="copfn">${fact.note || ''}</div></div>`,
    )
    .join('')
  const number = chapter.label || chapter.no
  const anchor = escapeHtml(chapter.anchor)
  return (
    `<div class="chopener" data-break="before" data-solo="1" data-anchor="${anchor}" ` +
    `data-chapterhead="${escapeAttr(`${number}. ${chapter.title}`)}">` +
    // id 는 이 머리에 둔다. 쪽 나누기 스크립트는 장 표지의 자식만 쪽에 옮겨 싣는다.
    `<div class="cophead" id="${anchor}" role="heading" aria-level="1">` +
    `<div class="copno">${escapeHtml(number)}${outlineSpace}</div>` +
    `<div class="copt">${escapeHtml(chapter.title)}</div></div>` +
    `<div class="copsum">${chapter.summary || ''}</div>` +
    (facts ? `<div class="copfacts">${facts}</div>` : '') +
    chapterSectionList(chapter, words, sectionListMax) +
    `</div>`
  )
}
