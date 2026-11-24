// 웹판 CSS — 쪽을 나누지 않는 읽기용 HTML 의 모양. 본문 폭 제한, 옆 차례, 좁은 화면의 접는 차례, 밝은 · 어두운 테마.
// 부르는 곳: web/index.mjs(renderWebHtml).
// 먼저 읽을 파일: render/styles.mjs(같은 블록 클래스의 인쇄판 모양), theme/index.mjs(색 값).
//
// 블록 HTML 은 인쇄판과 같은 함수(render/blocks.mjs)가 만든다. 그래서 클래스 이름은 인쇄판과 같고 값만 웹에 맞춘다.
// 색은 CSS 변수로 두고 어두운 테마에서 변수만 바꾼다. 굵기는 내장 글꼴의 두 굵기(400 · 700)만 쓴다.

import { INK, INK2, INK3, LINE, LINE2, PAPER, SURF } from '../theme/index.mjs'

/** 어두운 테마의 색. 글자 대비는 밝은 테마와 같은 단계(진함 · 보통 · 흐림)를 지킨다. */
const DARK = Object.freeze({ ink: '#e8eaee', ink2: '#c3c8d1', ink3: '#959dab', line: '#3a404b', line2: '#2c313a', paper: '#15181e', surf: '#20242c' })

function colorTokens(accent) {
  const light = `--ink:${INK};--ink2:${INK2};--ink3:${INK3};--line:${LINE};--line2:${LINE2};--paper:${PAPER};--surf:${SURF};--accent:${accent}`
  const dark = `--ink:${DARK.ink};--ink2:${DARK.ink2};--ink3:${DARK.ink3};--line:${DARK.line};--line2:${DARK.line2};--paper:${DARK.paper};--surf:${DARK.surf}`
  return `:root{${light};color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{${dark}}}`
}

function layoutCss(theme, words) {
  return `
*{box-sizing:border-box}
html{scroll-padding-top:16px}
body{margin:0;background:var(--paper);color:var(--ink2);font-family:${theme.sans};font-size:16px;line-height:1.7;word-break:${words.wordBreak};overflow-wrap:break-word}
a{color:var(--accent)}
.wlayout{display:grid;grid-template-columns:minmax(220px,280px) minmax(0,1fr);gap:48px;max-width:1180px;margin:0 auto;padding:0 24px}
.wside{position:sticky;top:0;align-self:start;max-height:100vh;overflow-y:auto;padding:32px 0;font-size:14px}
.wtoctitle{font-size:12px;letter-spacing:0.14em;color:var(--ink3);margin-bottom:8px}
.wtoc{list-style:none;margin:0;padding:0}
.wtoc ul{list-style:none;margin:0 0 8px;padding:0 0 0 14px}
.wtoc a{display:block;padding:3px 0;color:var(--ink2);text-decoration:none}
.wtoc a:hover{color:var(--accent)}
.wtoc>li>a{font-weight:700;color:var(--ink);margin-top:8px}
.wtocno{font-family:${theme.mono};font-size:12px;color:var(--ink3);margin-right:8px}
.wtocmini{display:none;margin:0 0 24px;padding:8px 12px;border:1px solid var(--line);border-radius:6px}
.wtocmini summary{cursor:pointer;font-weight:700;color:var(--ink)}
.wmain{max-width:760px;padding:40px 0 80px;min-width:0}
.whead{padding-bottom:24px;margin-bottom:32px;border-bottom:1px solid var(--line)}
.wbrand{font-size:13px;font-weight:700;color:var(--ink3);letter-spacing:0.02em}
.wtitle{font-size:36px;line-height:1.25;font-weight:700;color:var(--ink);margin:8px 0 4px}
.wsub{font-size:13px;letter-spacing:0.2em;color:var(--ink3)}
.wlede{font-size:17px;color:var(--ink2);margin:16px 0 0}
.wedition{font-family:${theme.mono};font-size:12px;color:var(--ink3);margin-top:12px}
.wfoot{margin-top:64px;padding-top:16px;border-top:1px solid var(--line);font-size:13px;color:var(--ink3)}
@media (max-width:900px){
  .wlayout{display:block;padding:0 16px}
  .wside{display:none}
  .wtocmini{display:block}
  .wmain{padding-top:24px}
  .wtitle{font-size:28px}
}`
}

function blockCss(theme) {
  return `
.osp{font-size:1px}
.bchapter{display:flex;gap:12px;align-items:baseline;margin:56px 0 8px;padding-top:16px;border-top:2px solid var(--ink)}
.bchno{font-family:${theme.mono};font-size:20px;color:var(--accent)}
.bchtitle{font-size:28px;font-weight:700;color:var(--ink);line-height:1.3}
.bsechead{display:flex;align-items:baseline;gap:12px;margin:40px 0 12px}
.bsecno{font-family:${theme.mono};font-size:14px;color:var(--accent);flex:none}
.bsectitle{font-size:22px;font-weight:700;color:var(--ink);line-height:1.35}
.bsecmono{font-family:${theme.mono};font-size:12px;color:var(--ink3)}
.bh3{font-size:17px;font-weight:700;color:var(--ink);margin:28px 0 8px}
.bh3sub{font-size:14px;font-weight:400;color:var(--ink2);margin-top:4px}
.bp{margin:0 0 16px}
.blede{margin:0 0 18px;font-size:17px}
strong,b{color:var(--ink);font-weight:700}
code{font-family:${theme.mono};font-size:0.9em;color:var(--ink);background:var(--surf);padding:1px 4px;border-radius:3px}
.blabel{font-size:12px;letter-spacing:0.14em;color:var(--ink3);font-weight:700;margin:20px 0 8px}
.bdefs{display:grid;grid-template-columns:minmax(90px,160px) 1fr;gap:8px 16px;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:16px;font-size:15px}
.bdk{color:var(--ink3)}
.bsteps,.bul{margin:0 0 16px;padding-left:24px}
.bsteps li,.bul li{margin-bottom:6px}
.bsteps>li::marker{color:var(--ink3);font-family:${theme.mono}}
.bstepnote{font-size:14px;margin-top:6px}
.bcode,.bul pre,.bsteps pre{margin:8px 0 16px;padding:12px 14px;background:var(--surf);border:1px solid var(--line);border-radius:6px;font-family:${theme.mono};font-size:13px;line-height:1.6;color:var(--ink);white-space:pre;overflow-x:auto}
.btblwrap{overflow-x:auto;margin:0 0 4px}
.btbl{width:100%;border-collapse:collapse;font-size:14px}
.btbl th{text-align:left;padding:8px 10px;font-size:13px;color:var(--ink2);background:var(--surf);border-top:1.5px solid var(--ink);border-bottom:1px solid var(--line);font-weight:700}
.btbl td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;min-width:7em}
.btbl td.cstrong,.btbl th.cstrong{font-weight:700;color:var(--ink)}
.btbl td.cmono,.btbl th.cmono{font-family:${theme.mono};font-size:13px}
.btbl td.ccenter,.btbl th.ccenter{text-align:center}
.btblcap,.bfigcap{font-size:13px;color:var(--ink3);margin:6px 0 20px}
.bcallout{display:grid;grid-template-columns:64px 1fr;gap:12px;padding:12px 0;border-top:1px solid var(--co);border-bottom:1px solid var(--co);margin:18px 0}
.bcokind{font-size:12px;letter-spacing:0.14em;color:var(--co);font-weight:700;padding-top:3px}
.bcobody{font-size:15px}
.bfig{margin:8px 0 4px}
.bfigframe{border:1px solid var(--line);border-radius:6px;overflow:hidden;background:#fff}
.bfigframe.bfigimg{width:fit-content;max-width:100%;margin:0 auto}
.bfigframe img{display:block;max-width:100%;height:auto;margin:0 auto}
.bfigsvg{padding:8px}
.bfigsvg svg{display:block;width:100%;height:auto;max-width:none !important;max-height:none !important}
.bfigmk{position:relative;width:fit-content;max-width:100%;margin:0 auto}
.bmark{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;border:2px solid #fff;font-size:11px;font-weight:700;line-height:18px;text-align:center}
.bcards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px}
.bcard{padding:12px 14px;border:1px solid var(--line);border-radius:6px}
.bcardt{font-size:13px;font-weight:700;color:var(--ink)}
.bcardv{font-size:20px;font-weight:700;margin-top:4px;color:var(--accent)}
.bcardn{font-size:13px;margin-top:2px}
.bsources{margin:20px 0 0;padding-top:10px;border-top:1px solid var(--line2);font-size:13px;color:var(--ink3)}`
}

/** 웹판 CSS 한 벌. theme 은 defineTheme() 의 결과, words 는 언어 묶음이다. */
export function webCss(theme, words) {
  return colorTokens(theme.accent) + layoutCss(theme, words) + blockCss(theme)
}
