// 특성화 도우미 — 옮기기 전 엔진의 결과(source-engine.json)와 지금 엔진의 결과를 같은 방법으로 재고 견준다.
// 부르는 곳: test/render/characterize.test.mjs · layout.test.mjs, 기준값을 만든 스크립트(옮기기 전 엔진에서 한 번 돌렸다).
// 먼저 읽을 파일: test/fixtures/virtual-book.mjs(원고와 설정 변형), src/render/paginator.mjs.
import { createHash } from 'node:crypto'
import { openDocument } from '../../src/browser/print.mjs'

/** 쪽 나누기 스크립트 선택 사항 묶음. 묶음마다 스크립트 코드가 옮기기 전과 같은지 본다. */
export const PAGINATOR_OPTION_SETS = Object.freeze({
  none: {},
  fill: { fillSplitRows: 3 },
  sectionList: { splitSectionList: true },
  landscape: { landscape: true },
  contMark: { contMark: true },
  storyboard: { storyboard: true, onDone: 'window.__done = 1;' },
  all: { fillSplitRows: 4, splitSectionList: true, landscape: true, contMark: true, storyboard: true },
})

/** 오류 문구 조각. 옮기면서 한국어에서 영어로 바꿨으므로 견줄 때는 둘 다 같은 표시로 바꾼다. */
export const SOURCE_MESSAGES = ['조판이 수렴하지 않습니다(', '회 · ', '초) — ', '(시작)', '번째 블록 · ']
export const MESSAGES = ['Typesetting did not converge (', ' steps, ', ' s) at ', '(start)', '. block · ']

export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

/**
 * 스크립트 코드만 남긴다: 로마 숫자 함수 소스 · 오류 문구 · 한 줄 주석 · 공백을 지운다.
 * 로마 숫자 함수는 이름을 읽기 쉽게 바꿨으므로 따로 결과값으로 견준다.
 */
export function normalizeScript(script, { romanSource, messages }) {
  let code = script.replace(romanSource, 'ROMAN')
  for (const message of messages) code = code.split(`'${message}'`).join("'MSG'")
  return code.replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/\s+/g, '')
}

/** CSS 의 주석과 공백을 지운다. */
export const normalizeCss = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '')

/**
 * 굵기를 내장 글꼴의 두 굵기로 바꾼다(500 → 400, 600 · 800 → 700). 옮긴 엔진은 굵기를 이렇게 바꿨다.
 * 내장 글꼴로 그리면 브라우저가 고르는 글꼴 파일이 바꾸기 전과 같아서 쪽 배치는 달라지지 않는다.
 */
export const mapWeightsToBuiltin = (css) => css.replace(/font-weight:500\b/g, 'font-weight:400').replace(/font-weight:(600|800)\b/g, 'font-weight:700')

/** 조판 HTML 에서 흐름 블록(#flow 안)과 문서 CSS(둘째 <style>)를 꺼낸다. */
export function splitPrintHtml(html) {
  const flowStart = html.indexOf('<div id="flow" aria-hidden="true">')
  const flowEnd = html.indexOf('</div>\n<script>', flowStart)
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1])
  return { flow: html.slice(flowStart, flowEnd), css: styles[1] }
}

/** 열 폭 사례. 옮기기 전 엔진의 결과가 source-engine.json 에 있다. */
export const COLUMN_CASES = Object.freeze([
  [['단계', '파일', '설명'], [['1', '<code>server/src/db/migrate.ts</code>', '파일을 차례로 적용하고 실패하면 되돌린 뒤 기록을 남긴다'], ['2', '<code>a.ts</code>', '되돌린다']]],
  [['이름', '비고', '근거', '설명'], [['a', '', '<code>docs/x.md:12-40</code> 부근', '아주 긴 설명 '.repeat(30)], ['b', '', '-', '아주 긴 설명 '.repeat(30)]]],
  [['항목', '내용'], [['책임', '보기를 정한다. '.repeat(8)], ['주요 속성 — 표시 · 차트', '표시 21개'], ['불변 조건', '기본값과 합친다']]],
  [['단계', '설명'], [['1', '설명 '.repeat(50)], ['2', '설명 '.repeat(30)]]],
  [['순번', '키', '경로 1', '경로 2', '경로 3'], [['12', 'PK', '<code>apps/server/src/routes/runtime/pages.ts</code>', '<code>apps/server/src/routes/runtime/pages.ts</code>', '<code>apps/server/src/routes/runtime/pages.ts</code>']]],
  [null, [['가', '나', '다'], ['라', { html: '합친 칸', span: 2 }]]],
  [Array.from({ length: 12 }, (_, i) => `열${i}`), [Array.from({ length: 12 }, (_, i) => `값${i}`.repeat(i + 1))]],
])

/** SVG 검사 사례. 옮기기 전 엔진에서 통과(null)인지 실패인지가 source-engine.json 에 있다. */
const wrap = (inner, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"${attrs}>${inner}</svg>`
export const SVG_CASES = Object.freeze([
  wrap('<g/>'),
  wrap('<defs><marker id="a"><path d="M0 0L1 1"/></marker></defs><line x1="0" y1="0" x2="1" y2="1" marker-end="url(#a)"/>'),
  wrap('<line x1="0" y1="0" x2="1" y2="1" stroke-width="1" stroke-width="1.4"/>'),
  wrap('<text x="1" y="1" font-family="&#x27;Noto Sans KR&#x27;">A &amp; B &lt; C</text>'),
  wrap('<image x="0" y="0" width="1" height="1" href="data:image/png;base64,iVBORw0KGgo="/>'),
  `﻿${wrap('<g/>')}`,
  wrap('<script/>'),
  wrap('<SCRIPT/>'),
  wrap('<svg:rect/>'),
  wrap('<rect onload="x"/>'),
  wrap('<image href="x.png"/>'),
  wrap('<rect fill="url(http://example.invalid/x)"/>'),
  wrap('<rect style="fill:&#117;rl(file:///etc/hosts)"/>'),
  wrap('<rect style="fill:image-set(\'x.png\' 1x)"/>'),
  wrap('<rect x="1"y="2"/>'),
  `${wrap('')}${wrap('')}`,
  wrap('<![CDATA[x]]>'),
  wrap('<text>&nbsp;</text>'),
  wrap('<!-- a -- b -->'),
  '<g/>',
  '',
])

/** 가로 판정 사례 [표, minCols]. */
export const LAND_CASES = Object.freeze([
  [{ head: Array(8).fill('h'), rows: [] }, 8],
  [{ head: Array(7).fill('h'), rows: [] }, 8],
  [{ rows: [Array(9).fill('c')] }, 8],
  [{ head: Array(3).fill('h'), rows: [], land: true }, 8],
  [{ head: Array(12).fill('h'), rows: [], land: false }, 8],
  [{ head: Array(12).fill('h'), rows: [], compact: true }, 8],
  [{ head: Array(4).fill('h'), rows: [] }, 4],
])

/** 조판이 끝난 문서에서 쪽마다 읽는 값. 글꼴 너비 표본(probeWidth)으로 같은 글꼴에서 잰 것인지 확인한다. */
const LAYOUT_EXPRESSION = `JSON.stringify((function(){
  var probe = document.createElement('span');
  probe.style.cssText = 'font-size:13px;white-space:nowrap';
  probe.textContent = '가나다라 Acme 0123 ABCxyz';
  document.body.appendChild(probe);
  var probeWidth = probe.getBoundingClientRect().width;
  probe.remove();
  return { err: window.__err || null, overflow: window.__overflow, anchors: window.__anchors,
    pageCount: window.__pageCount, frontCount: window.__frontCount, probeWidth: probeWidth,
    pages: Array.from(document.querySelectorAll('#book .page:not(.cover)')).map(function(p){
      var area = p.querySelector('.parea');
      return { label: p.getAttribute('data-label'), land: p.classList.contains('land'),
        theads: area.querySelectorAll('thead').length,
        rows: Array.from(area.querySelectorAll('tbody tr')).map(function(tr){ return tr.cells[0].textContent; }),
        items: area.querySelectorAll('li').length,
        ids: Array.from(p.querySelectorAll('[id]')).map(function(e){ return e.id; }),
        caps: area.querySelectorAll('.btblcap').length,
        conts: area.querySelectorAll('.btblcont').length,
        headLeft: p.querySelector('.phead .l').textContent, head: p.querySelector('.phead .r').textContent,
        footLeft: p.querySelector('.pfoot > div').textContent, foot: p.querySelector('.pfoot .n').textContent,
        height: area.scrollHeight, blocks: area.children.length }; }) };
})())`

/** 조판 HTML 을 빈 쪽에 넣고 쪽 나누기가 끝나면 쪽 배치를 읽는다. 쪽 배치 = LAYOUT_EXPRESSION 의 결과. */
export async function typesetLayout(cdp, html) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const call = (method, params) => cdp.send(method, params, sessionId)
  try {
    await call('Runtime.enable')
    await openDocument(call, html, 0)
    const until = Date.now() + 60000
    for (;;) {
      const done = await call('Runtime.evaluate', { expression: 'window.__paged === true', returnByValue: true })
      if (done.result.value) break
      if (Date.now() > until) throw new Error('typesetting did not finish')
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const answer = await call('Runtime.evaluate', { expression: LAYOUT_EXPRESSION, returnByValue: true })
    return JSON.parse(answer.result.value)
  } finally {
    await cdp.send('Target.closeTarget', { targetId })
  }
}
