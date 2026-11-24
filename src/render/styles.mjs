// 문서 CSS — 인쇄판 조판 문서의 쪽 크롬 · 표지 · 앞붙임 · 장 표지 · 본문 블록 · 선택 사항 CSS 를 한 벌로 짠다.
// 부르는 곳: render/index.mjs(인쇄판 HTML 의 <style>).
// 먼저 읽을 파일: render/paginator.mjs 의 pageChromeCss(쪽 크기와 쪽 크롬), theme/index.mjs(색 값).
//
// format = { words, theme, typeset, isLandBook } 는 render/index.mjs 가 만든다. 선택 사항을 켜지 않으면 그 CSS 는 들어가지 않는다.
// 굵기는 400 · 700 두 가지만 쓴다. 내장 글꼴이 두 굵기뿐이라 다른 굵기는 가까운 굵기로 그려지기 때문이다.

import { INK, INK2, INK3, LINE, LINE2, SURF } from '../theme/index.mjs'
import { isLandBook, landBookCss, landContCss } from './landscape.mjs'
import { pageChromeCss } from './paginator.mjs'

function approvalCss() {
  return `.cvbottom:has(.cvappr){bottom:120px}
.cvbottom:has(.cvappr)>.cvmeta{align-content:start}
.cvappr{grid-column:2;width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px;margin-top:14px}
.cvappr th{font-weight:700;color:${INK2};background:${SURF};padding:5px 0;border:1px solid ${LINE};text-align:center}
.cvappr td{border:1px solid ${LINE};vertical-align:top;padding:4px 6px}
.cvappr .cvsign td{height:58px}
.cvappr .cvdate td{height:26px}
.cvapl{font-size:9.5px;color:${INK3}}
`
}

function coverCss({ theme }, hasApproval) {
  const accent = theme.accent
  return `
/* ── 표지 ─────────────────────────────────────────────── */
.cover{color:${INK}}
.cvband{position:absolute;left:0;top:0;bottom:0;width:22px;background:${accent}}
.cvhead{position:absolute;left:64px;right:64px;top:56px;display:flex;justify-content:space-between;align-items:center}
.cvbrand{display:flex;align-items:center;gap:10px}
.cvmark{width:28px;height:28px;flex:none}
.cvmark svg{display:block;width:100%;height:100%}
.cvname{font-size:13px;font-weight:700;letter-spacing:0.02em}
.cvset{font-size:11px;color:${INK3};letter-spacing:0.14em;margin-left:6px}
.cvrev{font-family:${theme.mono};font-size:11px;color:${INK3}}
.cvmain{position:absolute;left:64px;right:64px;top:250px;display:flex;flex-direction:column;gap:18px}
.cvno{font-family:${theme.mono};font-size:96px;font-weight:400;line-height:1;color:${accent};letter-spacing:-0.04em}
.cvtitles{display:flex;flex-direction:column;gap:8px}
.cvtitle{font-size:48px;font-weight:700;letter-spacing:-0.02em;line-height:1.1}
.cven{font-size:12px;letter-spacing:0.26em;color:${INK3};font-weight:400}
.cvrule{width:64px;height:3px;background:${INK};margin-top:6px}
.cvlede{font-size:15px;line-height:1.6;color:${INK2};max-width:520px;text-wrap:pretty}
.cvbottom{position:absolute;left:64px;right:64px;bottom:150px;display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:48px;align-items:end}
.cvtopicsh{font-size:11px;letter-spacing:0.14em;color:${INK3};padding-bottom:8px;border-bottom:1.5px solid ${INK}}
.cvrow{display:flex;gap:14px;align-items:baseline;padding:9px 0;border-bottom:1px solid ${LINE2}}
.cvn{font-family:${theme.mono};font-size:11px;color:${INK3};width:22px;flex:none}
.cvt{font-size:13.5px;color:${INK2}}
.cvmeta{display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:11.5px;align-content:end}
.cvk{color:${INK3}}
.cvv.mono{font-family:${theme.mono}}
${hasApproval ? approvalCss() : ''}.cvfoot{position:absolute;left:64px;right:64px;bottom:56px;display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid ${LINE};font-size:10.5px;color:${INK3}}
`
}

function frontCss({ theme }) {
  return `
/* ── 문서 정보 · 목차 ─────────────────────────────────── */
.dieyebrow{font-size:11px;letter-spacing:0.2em;color:${INK3};font-weight:400}
.dititle{font-size:30px;font-weight:700;letter-spacing:-0.02em;margin:6px 0 18px}
/* 목차 줄 = 링크. 제목 뒤 점선(.tocdots)이 남은 폭을 채워 쪽 번호와 잇는다. 빈 칸의 아래 테두리가 글자 기준선에
   놓이므로 글자 높이 중간쯤으로 올린다. 제목이 길면 줄을 바꾸고 점선은 마지막 줄 끝에 최소 폭으로 남는다. */
a.tocch,a.tocsec,a.coprow{color:inherit;text-decoration:none}
.tocdots{flex:1 1 24px;min-width:24px;align-self:baseline;border-bottom:1.5px dotted ${INK3};transform:translateY(-0.3em);opacity:0.7}
.tocch{display:flex;align-items:baseline;gap:10px;padding:14px 0 6px;margin-top:6px}
.tocn{font-family:${theme.mono};font-size:12px;color:${INK3};width:34px;flex:none}
.toct{font-size:16px;font-weight:700;flex:0 1 auto}
.tocch .tocp{font-family:${theme.mono};font-size:12px;min-width:24px;text-align:right;font-weight:700}
.tocsec{display:flex;align-items:baseline;gap:10px;padding:5px 0}
.tocsn{font-family:${theme.mono};font-size:11px;color:${INK3};width:34px;flex:none;white-space:nowrap}
.tocsn.apx{width:50px}
.tocst{font-size:13px;color:${INK2};flex:0 1 auto}
.tocsp{font-family:${theme.mono};font-size:11.5px;color:${INK2};min-width:24px;text-align:right}
.osp{font-size:1px}
.convbox{margin-top:28px;padding:14px 16px;background:${SURF};border-radius:6px;font-size:12px;color:${INK2};line-height:1.6}
.convbox b{color:${INK}}
.convcode{font-family:${theme.mono};font-size:11px;background:#fff;border:1px solid ${LINE};padding:1px 5px;border-radius:3px}
.convref{color:${INK3}}
.convcau{color:${theme.callouts.caution}}
.convwarn{color:${theme.callouts.warning}}
`
}

function chapterCss({ theme }) {
  const accent = theme.accent
  return `
/* ── 장 표지 ───────────────────────────────────────────── */
.chopener{padding-top:120px}
.copno{font-family:${theme.mono};font-size:72px;font-weight:400;line-height:1;color:${accent};letter-spacing:-0.04em}
.copt{font-size:40px;font-weight:700;letter-spacing:-0.02em;margin-top:22px}
.copsum{font-size:15px;line-height:1.65;color:${INK2};max-width:520px;text-wrap:pretty;margin-top:22px}
.copfacts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:64px}
.copfact{padding:14px 16px;border:1px solid ${LINE};border-radius:6px}
.copfl{font-size:11px;letter-spacing:0.12em;color:${INK3}}
.copfv{font-size:20px;font-weight:700;margin-top:6px;line-height:1.25}
.copfn{font-size:11.5px;color:${INK2};margin-top:2px}
.copseclabel{font-size:11px;letter-spacing:0.14em;color:${INK3};padding-bottom:8px;border-bottom:1.5px solid ${INK};margin-top:40px}
.coprow{display:flex;gap:10px;align-items:baseline;padding:8px 0}
.copsn{font-family:${theme.mono};font-size:11px;color:${INK3};width:30px;flex:none;white-space:nowrap}
.copsn.apx{width:50px}
.copst{font-size:13px;flex:0 1 auto}
.copsp{font-family:${theme.mono};font-size:11px;color:${INK3};min-width:20px;text-align:right}
`
}

function textBlockCss({ theme }) {
  const accent = theme.accent
  return `
/* ── 본문 프리미티브 ───────────────────────────────────── */
.bsechead{display:flex;align-items:baseline;gap:12px;margin:26px 0 10px}
.bsechead:first-child{margin-top:0}
.bsecno{font-family:${theme.mono};font-size:13px;color:${accent};font-weight:400;flex:none}
.bsectitle{font-size:22px;font-weight:700;letter-spacing:-0.01em}
.bsecmono{font-family:${theme.mono};font-size:12px;color:${INK3}}
.bh3{font-size:15px;font-weight:700;letter-spacing:-0.01em;margin:18px 0 8px}
.bp{margin:0 0 12px;font-size:13px;line-height:1.7;color:${INK2};text-wrap:pretty}
.blede{margin:0 0 14px;font-size:14px;line-height:1.7;color:${INK2};text-wrap:pretty}
/* 브라우저 기본 스타일이 code 를 시스템 고정폭 글꼴로 잡으면 PDF 에 내장되지 않은 글꼴이 섞인다. 그래서 code 전체를 덮는다. */
code{font-family:${theme.mono};font-size:0.92em;color:${INK}}
.bp strong,.bul strong,.bsteps strong,.bcobody strong{color:${INK};font-weight:700}
.blabel{font-size:11px;letter-spacing:0.14em;color:${INK3};font-weight:700;margin:16px 0 8px}
.bdefs{display:grid;grid-template-columns:110px 1fr;gap:6px 14px;font-size:12.5px;line-height:1.55;padding:10px 0;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};margin-bottom:14px}
.bdk{color:${INK3}}
.bdv{color:${INK2}}
.bsteps{margin:0 0 14px;padding:0 0 0 22px;font-size:13px;line-height:1.65;color:${INK}}
.bsteps>li{margin-bottom:8px}
.bsteps>li::marker{color:${INK3};font-family:${theme.mono};font-weight:400}
.bul{margin:0 0 14px;padding:0 0 0 20px;font-size:13px;line-height:1.65;color:${INK2}}
.bul>li{margin-bottom:6px}
.bul>li::marker{color:${INK3}}
.bcodewrap{margin-top:6px}
.bstepnote{margin-top:6px;font-size:12px;line-height:1.6;color:${INK2}}
/* 코드 블록은 문단 속 코드(0.92em × 13px = 12px)와 같은 12px 로 둔다. 본문 · 예시 · 터미널 글자 크기를 맞추기 위해서다. */
.bcode{margin:0 0 14px;padding:12px 14px;background:${SURF};border:1px solid ${LINE};border-radius:6px;font-family:${theme.mono};font-size:12px;line-height:1.6;color:${INK};white-space:pre-wrap;word-break:break-all}
`
}

function tableAndCalloutCss({ theme, words }) {
  return `.btblwrap{margin:0 0 4px}
.btbl{width:100%;border-collapse:collapse;font-size:12.5px;table-layout:fixed}
.btbl th{text-align:left;padding:8px 10px;font-size:11px;color:${INK2};background:${SURF};border-top:1.5px solid ${INK};border-bottom:1px solid ${LINE};font-weight:700}
.btbl td{padding:9px 10px;border-bottom:1px solid ${LINE};vertical-align:top;line-height:1.5;color:${INK2};word-break:${words.wordBreak};overflow-wrap:anywhere}
.btbl.bcompact td{padding:4px 10px;font-size:12px;line-height:1.4}
.btbl.bcompact th{padding:5px 10px}
.btbl td.cstrong,.btbl th.cstrong{font-weight:700;color:${INK}}
.btbl td.cmono,.btbl th.cmono{font-family:${theme.mono};font-size:11.5px}
.btbl td.ccenter,.btbl th.ccenter{text-align:center}
.btblcap{font-size:11px;color:${INK3};margin:6px 0 16px}
.bcallout{display:grid;grid-template-columns:52px 1fr;gap:12px;padding:10px 0;border-top:1px solid var(--co);border-bottom:1px solid var(--co);margin:14px 0}
.bcokind{font-size:11px;letter-spacing:0.14em;color:var(--co);font-weight:700;padding-top:2px}
.bcobody{font-size:12.5px;line-height:1.6;color:${INK2}}
.bfig{margin:0 0 4px}
.bfigframe{border:1px solid ${LINE};border-radius:6px;overflow:hidden;background:#fff}
/* 캡처는 틀이 그림 폭에 맞춘다. 그림보다 넓은 틀의 빈 바탕이 회색 띠로 보이지 않게 하기 위해서다. */
.bfigframe.bfigimg{width:fit-content;max-width:100%;margin:0 auto}
/* 세로로 긴 캡처가 본문 높이(975px)를 넘으면 쪽을 뚫는다. 비율을 지키며 한 쪽에 맞춘다. */
.bfigframe img{display:block;width:auto;height:auto;max-width:100%;max-height:860px;margin:0 auto}
.bh3sub{font-size:13px;font-weight:400;line-height:1.6;color:${INK2};margin-top:6px;letter-spacing:0}
.bfigsvg{background:#fff;padding:8px}
.bfigsvg svg{display:block;width:100%;height:auto}`
}

/** 선택 사항 CSS — 그림마다 맞춤(fitFigures), 가로 쪽(fitFigures · 가로 표), 「(계속)」 표시(가로 표 · 가로 책). */
function optionalCss({ typeset, isLandBook: isLand }) {
  const hasLandTables = typeset.landTables === 'auto'
  return (
    (typeset.fitFigures ? '\n.bfig[data-fit] .bfigsvg svg{max-width:var(--fw) !important;max-height:var(--fh) !important}' : '') +
    ((typeset.fitFigures || hasLandTables) && !isLand
      ? '\n@page land{size:297mm 210mm;margin:0}' +
        '\n.page.land{page:land;width:297mm;height:210mm}' +
        '\n.page.land .phead,.page.land .parea,.page.land .pfoot{left:48px;right:48px}'
      : '') +
    (hasLandTables || isLand ? landContCss(INK3) : '')
  )
}

function figureAndCardCss({ theme }) {
  const accent = theme.accent
  return `
.bfigmk{position:relative;width:fit-content;max-width:100%;margin:0 auto}
/* 번호 표식은 흐린 그림자를 쓰지 않는다. PDF 에서 회색 마스크 그림으로 구워져 뷰어에 따라 회색 네모로 보인다. */
.bmark{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:${accent};color:#fff;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.3);font-size:11px;font-weight:700;line-height:18px;text-align:center;font-family:${theme.sans}}
.bfigcap{font-size:11px;color:${INK3};margin:6px 0 16px;line-height:1.55}
.bcards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px}
.bcard{padding:12px 14px;border:1px solid ${LINE};border-radius:6px}
.bcardt{font-size:12px;font-weight:700}
.bcardv{font-size:18px;font-weight:700;margin-top:4px;color:${accent};line-height:1.25}
.bcardn{font-size:11.5px;color:${INK2};margin-top:2px;line-height:1.5}
.bsources{margin:18px 0 0;padding-top:10px;border-top:1px solid ${LINE2};font-size:10.5px;line-height:1.6;color:${INK3}}
.bsources b{color:${INK2}}
`
}

/** 인쇄판 문서 CSS 한 벌. extraCss 는 확장 블록(예: storyboard)이 더하는 CSS 다. */
export function documentCss(format, settings, extraCss = '') {
  const chrome = pageChromeCss(format.theme.accent, {
    ...(isLandBook(settings) ? { landscape: true } : {}),
    fonts: { sans: format.theme.sans, mono: format.theme.mono },
    wordBreak: format.words.wordBreak,
  })
  return (
    chrome +
    coverCss(format, Boolean(settings.cover.approvalBox)) +
    frontCss(format) +
    chapterCss(format) +
    textBlockCss(format) +
    tableAndCalloutCss(format) +
    optionalCss(format) +
    figureAndCardCss(format) +
    extraCss +
    (format.isLandBook ? landBookCss() : '')
  )
}
