// 쪽 나누기 스크립트 — 브라우저 안에서 흐름 블록을 재어 쪽에 나눠 싣고, 머리글 · 꼬리글 · 쪽 번호 · 차례 쪽 번호를 채운다.
// 부르는 곳: render/index.mjs(조판 HTML 에 넣는다), 공개 진입점 `typeset-kit/paginator`(다른 판형이 직접 쓴다).
// 먼저 읽을 파일: docs/contract.md 「쪽 나누기 스크립트가 알리는 값」, 아래 「문서 규약」.
//
// 문서 규약
//   - `#flow`(숨김) 의 자식 = 흐름 블록. `#book` 에 쪽(.page > .phead · .parea · .pfoot)을 만들어 옮겨 싣는다.
//   - `data-front="1"` 앞붙임(로마 숫자 쪽 번호) · `data-break="before"` 새 쪽 · `data-solo="1"` 자기 쪽 · `data-keep="next"` 다음 블록과 붙임.
//   - `.bsechead[data-anchor]` 절 제목(제목만 쪽 끝에 남지 않게 다음 블록과 묶는다) · `[data-tocref]` 조판 뒤 쪽 번호를 채울 칸.
//   - 표(.btblwrap > table)는 행, 목록(ol · ul)은 항목 단위로 쪼갠다. 표 캡션(.btblcap)은 표의 마지막 조각과 붙인다.
//   - 끝나면 window.__paged = true(실패면 window.__err), __pageCount(표지 포함) · __frontCount · __anchors · __overflow.
//   - window.__PAGE_META__ 는 쪽 크롬(makePage)이 읽는다.
//
// 선택 사항을 주지 않은 스크립트는 버전이 바뀌어도 같은 쪽 배치를 낸다. 선택 사항은 켤 때만 코드가 더해진다.

import { INK, INK3, LINE, MONO, PAGE, PAGE_LAND, SANS } from '../theme/index.mjs'

/** 앞붙임 쪽 번호(로마 숫자 소문자, 1 ~ 39). 쪽 나누기 스크립트 안에 소스째 들어간다. */
export function roman(value) {
  var numerals = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']], out = '', rest = value;
  for (var i = 0; i < numerals.length; i++) { while (rest >= numerals[i][0]) { out += numerals[i][1]; rest -= numerals[i][0]; } }
  return out;
}

const BOOK_MAKE_PAGE = `  function makePage(state){
    var p = mk('page');
    var h = mk('phead');
    h.innerHTML = '<div class="l"><span class="dot"></span><span>'+PAGE_META.title+'</span></div><div class="r">'+ (state.head||'') +'</div>';
    var a = mk('parea');
    var f = mk('pfoot');
    f.innerHTML = '<div>'+PAGE_META.footer+'</div><div class="n">'+state.label+'</div>';
    p.setAttribute('data-label', state.label);
    p.appendChild(h); p.appendChild(a); p.appendChild(f);
    document.getElementById('book').appendChild(p);
    return { page:p, area:a, no:state.no, label:state.label };
  }`
const BOOK_NEW_PAGE_HEAD = `inFront ? '' : (headSection ? headChapter + ' › ' + headSection : headChapter)`
const BOOK_SECTION_HEAD = `headSection ? (headChapter + ' › ' + headSection) : headChapter`
// 확장 블록(storyboard) — 왼쪽 그림 + 오른쪽 설명 표(.bsb > .bsbdesc table). 쪼갤 표는 설명 표, 뒤 조각은 계속 쪽 모양(bsbcont)이다.
const SB_TABLE = `(el.classList && el.classList.contains('bsb') ? el.querySelector('.bsbdesc table') : null)`
const SB_CONT = ` if (clone.classList.contains('bsb')) clone.classList.add('bsbcont');`
// 표의 이어지는 조각 표시 — data-cont 가 있는 표 블록의 뒤 조각에 btblcont 를 단다(문구 · 모양은 문서 CSS 가 그린다).
const MARK_CONT = `  function markCont(c){ if (c.getAttribute && c.getAttribute('data-cont') !== null) c.classList.add('btblcont'); }
`

/** 조판이 끝나지 않을 때 브라우저를 묶어 두지 않도록 반복 횟수와 시간으로 끊는 감시. */
function guardSource() {
  return `  var PAGE_META = window.__PAGE_META__;
  // 시간 상한은 문서 크기(흐름 블록 수 · 표 행 수)에 비례한다. 반복 횟수 상한은 고정이다.
  var GUARD = 0, WHERE = '(start)', T0 = Date.now(), LIMIT_MS = 25000;
  function guard(){
    if (++GUARD > 200000 || (GUARD % 100 === 0 && Date.now() - T0 > LIMIT_MS))
      throw new Error('Typesetting did not converge (' + GUARD + ' steps, ' + Math.round((Date.now() - T0) / 1000) + ' s) at ' + WHERE);
  }
  function mk(cls){ var d=document.createElement('div'); d.className=cls; return d; }
`
}

/** 가로 쪽 판정 도우미. 가로 블록과, 가로 표 앞의 제목 · 문단(블록 4개 안)을 가로 쪽에 함께 싣는다. */
function landHelpersSource() {
  return `  function isLand(el){ return el.getAttribute('data-land') === '1'; }
  // 가로 그림(표 · 표 캡션이 아닌 가로 블록)은 절 제목 · 소제목과 묶지 않는다.
  function isLandFig(el){ return isLand(el) && !el.classList.contains('btblwrap') && !el.classList.contains('btblcap'); }
  var LAND_LEAD = ['bsechead', 'bh3', 'bp', 'blede', 'blabel'];
  function landLead(i){
    for (var j = i; j < items.length && j < i + 4; j++){
      var e = items[j];
      if (isLand(e)) return e.classList.contains('btblwrap');
      if (e.getAttribute('data-solo') === '1' || e.getAttribute('data-front') === '1' || (j > i && e.getAttribute('data-break') === 'before')) return false;
      var lead = false;
      for (var q = 0; q < LAND_LEAD.length; q++) if (e.classList.contains(LAND_LEAD[q])) lead = true;
      if (!lead) return false;
    }
    return false;
  }
  var landRun = false;
`
}

/** 쪽 상태와 새 쪽 열기 · 한 블록 싣기. */
function pageStateSource(opts, newPageHead) {
  return `  var flow = document.getElementById('flow');
  var items = Array.prototype.slice.call(flow.children);
  LIMIT_MS = window.__TYPESET_LIMIT_MS__ > 0 ? window.__TYPESET_LIMIT_MS__
    : 25000 + items.length * 20 + flow.getElementsByTagName('tr').length * 10;
  window.__typesetLimitMs = LIMIT_MS;
  var pages = [];
  var frontNo = 0, bodyNo = 0, inFront = true;
  var cur = null, avail = 0, used = 0;
  var headChapter = '', headSection = '';
  var anchorPage = {};

  function newPage(){
    var label;
    if (inFront) { frontNo++; label = roman(frontNo); }
    else { bodyNo++; label = String(bodyNo); }
    var head = ${newPageHead};
    cur = makePage({ label: label, no: (inFront? frontNo : bodyNo), head: head });
${opts.landscape ? `    if (landRun){ cur.page.classList.add('land'); cur.land = true; }
` : ''}    pages.push(cur);
    avail = cur.area.clientHeight;
    used = 0;
  }

  // 현재 쪽에 들어가면 붙이고 true, 안 들어가면 되돌리고 false. used 는 이 함수에서만 갱신한다.
  function tryPlace(el){
    guard();
    cur.area.appendChild(el);
    if (cur.area.scrollHeight <= avail + 0.5){ used = cur.area.scrollHeight; return true; }
    cur.area.removeChild(el);
    return false;
  }
`
}

/** 표를 행 단위로 쪼갠다. 앞에서부터 1 · 2 · 4 · 8 행으로 늘린 뒤 그 사이를 이분 탐색해 이 쪽에 남길 행 수를 찾는다. */
function splitTableSource(opts) {
  return `    var tbl = el.classList && el.classList.contains('btblwrap') ? el.querySelector('table') : ${opts.storyboard ? SB_TABLE : 'null'};
    if (tbl){
      var tb = tbl.tBodies[0];
      var all = Array.prototype.slice.call(tb.rows);
      var n = all.length;
      if (n <= 1) return null;
      function fitsWith(k){
        while (tb.rows.length > k) tb.removeChild(tb.rows[tb.rows.length-1]);
        while (tb.rows.length < k) tb.appendChild(all[tb.rows.length]);
        guard();
        cur.area.appendChild(el);
        var ok = cur.area.scrollHeight <= avail + 0.5;
        cur.area.removeChild(el);
        return ok;
      }
      var ok = 1, bad = 0;
      for (var k = 2; ; k *= 2){
        if (k >= n){ if (fitsWith(n)) ok = n; else bad = n; break; }
        if (fitsWith(k)) ok = k; else { bad = k; break; }
      }
      if (ok === n){ fitsWith(n); return null; }
      while (bad - ok > 1){
        var mid = (ok + bad) >> 1;
        if (fitsWith(mid)) ok = mid; else bad = mid;
      }
      // 남길 행만 두고 표를 복제(머리글 · 열 폭 포함)한 뒤 나머지 행을 새 표로 옮긴다
      while (tb.rows.length > 0) tb.removeChild(tb.rows[tb.rows.length-1]);
      var clone = el.cloneNode(true);${opts.storyboard ? SB_CONT : ''}${opts.contMark ? ' markCont(clone);' : ''}
      var ctb = clone.querySelector('tbody');
      for (var i=0;i<ok;i++) tb.appendChild(all[i]);
      for (var i2=ok;i2<n;i2++) ctb.appendChild(all[i2]);
      return clone;
    }
`
}

/** 장 표지의 절 목록(.copsecs)을 줄 단위로 쪼갠다. 들어가는 줄 수를 이분 탐색으로 찾는다. */
function splitSectionListSource() {
  return `    if (el.classList && el.classList.contains('copsecs')){
      var rowsAll = Array.prototype.slice.call(el.children);
      var rn = rowsAll.length;
      if (rn <= 1) return null;
      function secsFit(k){
        while (el.children.length > k) el.removeChild(el.lastElementChild);
        while (el.children.length < k) el.appendChild(rowsAll[el.children.length]);
        guard();
        cur.area.appendChild(el);
        var f = cur.area.scrollHeight <= avail + 0.5;
        cur.area.removeChild(el);
        return f;
      }
      if (secsFit(rn)) return null;
      var sok = 1, sbad = rn;
      while (sbad - sok > 1){ var smid = (sok + sbad) >> 1; if (secsFit(smid)) sok = smid; else sbad = smid; }
      secsFit(sok);
      var sclone = el.cloneNode(false);
      for (var si2 = sok; si2 < rn; si2++) sclone.appendChild(rowsAll[si2]);
      return sclone;
    }
`
}

/** 목록을 항목 단위로 쪼갠다. 번호 목록은 뒤 조각의 시작 번호를 잇는다. */
function splitListSource() {
  return `    var list = (el.tagName==='OL'||el.tagName==='UL') ? el : null;
    if (list){
      if (list.children.length <= 1) return null;
      var lclone = list.cloneNode(false);
      var lmoved = [];
      while (list.children.length > 1){
        guard();
        cur.area.appendChild(el);
        var lover = cur.area.scrollHeight > avail + 0.5;
        cur.area.removeChild(el);
        if (!lover) break;
        lmoved.unshift(list.children[list.children.length-1]);
        list.removeChild(list.children[list.children.length-1]);
      }
      if (!lmoved.length) return null;
      for (var j=0;j<lmoved.length;j++) lclone.appendChild(lmoved[j]);
      if (list.tagName==='OL'){
        var st = parseInt(list.getAttribute('start')||'1',10);
        lclone.setAttribute('start', String(st + list.children.length));
      }
      return lclone;
    }
    return null;
`
}

/** 한 쪽보다 큰 블록 쪼개기 — 표(행) · 장 표지 절 목록(줄) · 목록(항목). 쪼갤 수 없으면 null. */
function splitOffSource(opts) {
  return `
  function splitOff(el){
${splitTableSource(opts)}${opts.splitSectionList ? splitSectionListSource() : ''}${splitListSource()}  }

`
}

/** 쪽 아래 빈자리 채우기. 표가 이 쪽에 다 들어가지 않으면 들어가는 행까지 이 쪽에 두고 나머지를 다음 쪽으로 넘긴다. */
function fillSplitSource(fill) {
  return `  // 이 쪽에 남는 행이 ${fill}행보다 적으면 쪼개지 않는다(되돌리고 false). 쪼갰으면 true.
  function fillSplit(el){
    if (!(el.classList && el.classList.contains('btblwrap'))) return false;
    var ftb = el.querySelector('tbody');
    if (!ftb || ftb.rows.length <= ${fill}) return false;
    var rest = splitOff(el);
    if (!rest) return false;
    var rtb = rest.querySelector('tbody');
    function undo(){ while (rtb.firstElementChild) ftb.appendChild(rtb.firstElementChild); }
    if (ftb.rows.length < ${fill}){ undo(); return false; }
    cur.area.appendChild(el);
    if (cur.area.scrollHeight > avail + 0.5){ cur.area.removeChild(el); undo(); return false; }
    used = cur.area.scrollHeight;
    newPage(); pushBlock(rest);
    return true;
  }

`
}

/** 절 제목 뒤 블록 싣기와 일반 블록 싣기. 제목만 한 쪽에 남지 않게 제목 뒤 블록은 이 쪽에서 쪼개 본다. */
function placeSource(opts, fill) {
  return `  // 절 제목 바로 뒤 블록 — 새 쪽에서 제목과 함께 들어가지 않으면 이 쪽에서 쪼갠다. 한 행도 안 들어가면 넘긴다.
  function placeAfterHeading(el){
    if (tryPlace(el)) return;
    var rest = splitOff(el);
    if (rest){
      cur.area.appendChild(el);
      if (cur.area.scrollHeight <= avail + 0.5){ used = cur.area.scrollHeight; newPage(); pushBlock(rest); return; }
      cur.area.removeChild(el);
      // 되돌린다 — 떼어 낸 행 · 항목을 원래 블록 끝에 다시 붙인다
      var src = rest.querySelector ? (rest.querySelector('tbody') || rest) : rest;
      var dst = el.querySelector && el.querySelector('tbody') ? el.querySelector('tbody') : el;
      while (src.firstElementChild) dst.appendChild(src.firstElementChild);
    }
    pushBlock(el);
  }

  function pushBlock(el){
    guard();
    if (!cur) newPage();
    if (tryPlace(el)) return;
${opts.splitSectionList ? `    // 장 표지 절 목록은 새 쪽으로 넘기지 않고 이 쪽(장 표지)에서부터 이어 싣는다.
` : ''}    if (used > 0${opts.splitSectionList ? " && !(el.classList && el.classList.contains('copsecs'))" : ''}){ ${fill ? 'if (fillSplit(el)) return; ' : ''}newPage(); if (tryPlace(el)) return; }
    // 빈 쪽에도 안 들어간다 → 표는 행, 목록은 항목 단위로 쪼갠다
    var rest = splitOff(el);
    cur.area.appendChild(el);
    used = cur.area.scrollHeight;
    if (rest){ newPage(); pushBlock(rest); }
  }

`
}

/** 블록마다 쪽 종류(앞붙임 · 새 쪽 · 가로 쪽)를 정하는 앞부분. */
function loopStartSource(opts) {
  return `  for (var i=0;i<items.length;i++){
    var it = items[i];
    WHERE = i + '. block · ' + it.className + ' · ' + (it.textContent||'').slice(0,40);
    var isFront = it.getAttribute('data-front') === '1';
    if (!isFront && inFront){ inFront = false; cur = null; }
    if (it.getAttribute('data-break') === 'before') cur = null;
${opts.landscape ? `    // 가로 블록과 가로 표 앞머리는 가로 쪽에 싣는다. 앞 쪽도 가로 쪽이면 남은 자리에 잇고, 아니면 가로 쪽을 새로 연다.
    var wantLand = isLand(it) || landLead(i);
    if (cur && !!cur.land !== wantLand) cur = null;
    landRun = wantLand;
` : ''}
`
}

/** 장 표지 · 문서 정보(자기 쪽)와 차례 같은 흐르는 앞붙임. */
function soloAndFrontSource() {
  return `    if (it.getAttribute('data-solo') === '1'){
      if (it.classList.contains('chopener')){
        headChapter = it.getAttribute('data-chapterhead') || '';
        headSection = '';
      }
      newPage();
      var inner = Array.prototype.slice.call(it.children);
      for (var k=0;k<inner.length;k++) pushBlock(inner[k]);
      // 장 표지가 한 쪽을 넘쳐도 차례는 장 표지가 시작한 쪽을 가리킨다.
      if (it.hasAttribute('data-anchor')) anchorPage[it.getAttribute('data-anchor')] = inner.length ? inner[0].closest('.page').getAttribute('data-label') : cur.label;
      cur = null; // 장 표지 · 문서 정보는 자기 쪽에서 끝난다
      continue;
    }
    if (it.getAttribute('data-front') === '1'){
      var fronts = Array.prototype.slice.call(it.children);
      if (!cur) newPage();
      for (var m=0;m<fronts.length;m++) pushBlock(fronts[m]);
      continue;
    }

`
}

/** 절 제목. 뒤 블록과 함께 싣고, 머리글과 차례 쪽 번호는 제목이 실제로 놓인 쪽 기준으로 채운다. */
function sectionHeadSource(opts, fill, sectionHead) {
  const paintHead = opts.applyHead ? 'applyHead(pages[pi], running);' : "pages[pi].page.querySelector('.phead .r').textContent = running;"
  return `    if (it.classList.contains('bsechead')){
      headSection = it.querySelector('.bsecno').textContent.replace(/\u00a0/g, '') + ' ' + it.querySelector('.bsectitle').textContent;
      var group = [it];
      if (items[i+1] && !items[i+1].classList.contains('bsechead')${opts.landscape ? ' && !isLandFig(items[i+1])' : ''}) { group.push(items[i+1]); }
      if (!cur) newPage();
      var okAll = true;
      for (var g=0; g<group.length; g++){ if (!tryPlace(group[g])) { okAll = false; break; } }
${fill ? `      if (!okAll && group.length === 2 && group[0].parentNode === cur.area && group[1].parentNode !== cur.area && fillSplit(group[1])) okAll = true;
` : ''}      if (!okAll){
        for (var g2=0; g2<group.length; g2++){ if (group[g2].parentNode === cur.area) cur.area.removeChild(group[g2]); }
        used = cur.area.scrollHeight;
        // 빈 쪽에서 시작했으면 새 쪽을 열지 않는다 — 열면 머리글만 있는 빈 쪽이 남는다.
        if (cur.area.children.length) newPage();
        pushBlock(group[0]);
        for (var g3=1; g3<group.length; g3++) placeAfterHeading(group[g3]);
      }
      // 제목 뒤 블록이 다음 쪽으로 쪼개져 넘어가면 cur 는 이미 뒤쪽이라 제목이 놓인 쪽(hp)을 쓴다.
      var hp = it.closest('.page');
      var running = ${sectionHead};
      for (var pi = pages.indexOf(pages.filter(function(x){ return x.page === hp; })[0]); pi >= 0 && pi < pages.length; pi++){
        ${paintHead}
      }
      anchorPage[it.getAttribute('data-anchor')] = hp.getAttribute('data-label');
      i += group.length - 1;
      continue;
    }
`
}

/** 다음 블록과 붙여 싣는 블록(data-keep="next")과 표 캡션. 캡션만 다음 쪽 머리에 홀로 남지 않게 한다. */
function keepAndCaptionSource(opts, fill) {
  return `    if (it.getAttribute('data-keep') === 'next' && items[i+1]${opts.landscape ? ' && !isLandFig(items[i+1])' : ''}){
      if (!cur) newPage();
      var g1 = it, g2b = items[i+1];
      if (tryPlace(g1) && tryPlace(g2b)){ i++; continue; }
${fill ? `      if (g1.parentNode === cur.area && g2b.parentNode !== cur.area && fillSplit(g2b)){ i++; continue; }
` : ''}      if (g1.parentNode === cur.area) cur.area.removeChild(g1);
      if (g2b.parentNode === cur.area) cur.area.removeChild(g2b);
      used = cur.area.scrollHeight;
      newPage(); pushBlock(g1); pushBlock(g2b); i++;
      continue;
    }
    // 캡션이 표의 마지막 조각 뒤에 들어가지 않으면 그 조각의 끝 행(행이 하나면 조각 전체)을 캡션과 함께 다음 쪽으로 넘긴다.
    if (it.classList.contains('btblcap') && cur && cur.area.lastElementChild &&
        cur.area.lastElementChild.classList.contains('btblwrap')){
      if (!tryPlace(it)){
        var piece = cur.area.lastElementChild;
        var carry = null;
        var ptb = piece.querySelector('tbody');
        if (ptb && ptb.rows.length > 1){
          carry = piece.cloneNode(true);${opts.contMark ? ' markCont(carry);' : ''}
          var cb = carry.querySelector('tbody');
          while (cb.rows.length > 1) cb.deleteRow(0);
          ptb.deleteRow(ptb.rows.length-1);
        } else if (cur.area.children.length > 1){
          cur.area.removeChild(piece);
          carry = piece;
        }
        used = cur.area.scrollHeight;
        newPage();
        if (carry) pushBlock(carry);
        pushBlock(it);
      }
      continue;
    }
    pushBlock(it);
  }

`
}

/** 차례 · 장 표지의 쪽 번호를 채우고 조판 결과를 창 변수로 알린다. */
function finishSource(onDone) {
  return `  var refs = document.querySelectorAll('[data-tocref]');
  for (var r=0;r<refs.length;r++){
    var key = refs[r].getAttribute('data-tocref');
    refs[r].textContent = anchorPage[key] || '—';
  }
  flow.parentNode.removeChild(flow);
  // 쪼갤 수 없는 블록이 본문 높이보다 커서 쪽을 뚫은 면을 알린다
  window.__overflow = pages
    .map(function(p, i){ return p.area.scrollHeight > p.area.clientHeight + 0.5 ? p.label : null; })
    .filter(Boolean);
  window.__pageCount = pages.length + 1; // 표지 포함
  window.__frontCount = frontNo; // 표지 뒤 앞붙임 쪽 수(PDF 쪽 번호 표기용)
  window.__anchors = anchorPage;
  ${onDone}window.__paged = true;
 } catch (e) {
  window.__err = (e && e.message ? e.message : String(e));
  window.__pageCount = -1;
  ${onDone}window.__paged = true;
 }
});
`
}

/**
 * 쪽 나누기 스크립트(문자열). 문서에 <script> 로 싣는다.
 * @param {object} [opts]
 * @param {string} [opts.makePage] 쪽 크롬을 만드는 함수 `function makePage(state){ … return {page, area, no, label}; }` 의 소스.
 *   state = { label, no, head }. 기본 = 머리글 왼쪽 문서 제목 · 오른쪽 장 › 절, 꼬리글 왼쪽 PAGE_META.footer · 오른쪽 쪽 번호.
 * @param {string} [opts.newPageHead] 새 쪽의 head 값(식). 쓸 수 있는 변수: inFront · headChapter · headSection.
 * @param {string} [opts.sectionHead] 절 제목이 놓인 쪽부터 쓸 head 값(식).
 * @param {string} [opts.applyHead] `function applyHead(page, head){ … }` 의 소스. 주면 절 제목 뒤 head 를 이 함수로 칠한다.
 *   주지 않으면 머리글 오른쪽(.phead .r)의 글자를 head 로 바꾼다.
 * @param {string} [opts.onDone] 조판이 끝난 뒤(성공 · 실패 모두) `window.__paged = true` 바로 앞에 실행할 문장들.
 * @param {number} [opts.fillSplitRows] 쪽 아래 빈자리 채우기. 남은 자리에 머리글 + 이 수 이상의 행이 들어가면 표를 쪼개 채운다.
 * @param {boolean} [opts.splitSectionList] 장 표지의 절 목록(.copsecs)도 줄 단위로 쪼갠다.
 * @param {boolean} [opts.landscape] `data-land="1"` 블록을 가로 쪽(.page.land)에 싣는다. 가로 쪽 크기 · 여백은 문서 CSS 가 정한다.
 * @param {boolean} [opts.storyboard] 확장 블록 .bsb 의 설명 표(.bsbdesc table)를 행 단위로 쪼개고 뒤 조각에 `bsbcont` 를 단다.
 * @param {boolean} [opts.contMark] `data-cont` 가 있는 표 블록의 뒤 조각에 `btblcont` 를 단다.
 */
export function paginatorScript(opts = {}) {
  const makePage = opts.makePage ?? BOOK_MAKE_PAGE
  const newPageHead = opts.newPageHead ?? BOOK_NEW_PAGE_HEAD
  const sectionHead = opts.sectionHead ?? BOOK_SECTION_HEAD
  const onDone = opts.onDone ?? ''
  const fill = opts.fillSplitRows > 0 ? Math.floor(opts.fillSplitRows) : 0
  return `
// 내장 글꼴이 준비되기 전에 재면 대체 글꼴 너비로 조판돼 쪽이 넘친다 — 반드시 fonts.ready 뒤에 돈다.
document.fonts.ready.then(function(){
 try {
${guardSource()}${opts.contMark ? MARK_CONT : ''}${makePage}
${opts.applyHead ? `${opts.applyHead}\n` : ''}  ${roman.toString()}

${opts.landscape ? landHelpersSource() : ''}${pageStateSource(opts, newPageHead)}${splitOffSource(opts)}${fill ? fillSplitSource(fill) : ''}${placeSource(opts, fill)}${loopStartSource(opts)}${soloAndFrontSource()}${sectionHeadSource(opts, fill, sectionHead)}${keepAndCaptionSource(opts, fill)}${finishSource(onDone)}`
}

/**
 * 쪽 바탕 · 쪽 크롬 CSS(A4, 머리글 · 본문 · 꼬리글 자리).
 * @param {string} dot 머리글 앞 작은 네모 색.
 * @param {object} [opts]
 * @param {boolean} [opts.landscape] 책 전체를 A4 가로(297 × 210mm, 좌우 여백 PAGE_LAND.side)로 짠다.
 * @param {{sans: string, mono: string}} [opts.fonts] 글꼴 스택. 기본은 theme 의 SANS · MONO 다.
 * @param {string} [opts.wordBreak] 본문 줄바꿈 규칙(word-break 값). 기본은 keep-all(한국어 낱말 단위)이다.
 */
export function pageChromeCss(dot, opts = {}) {
  const isLand = opts.landscape === true
  const [width, height] = isLand ? [PAGE_LAND.width, PAGE_LAND.height] : [PAGE.width, PAGE.height]
  const [left, right] = isLand ? [PAGE_LAND.side, PAGE_LAND.side] : [PAGE.left, PAGE.right]
  const sans = opts.fonts?.sans ?? SANS
  const mono = opts.fonts?.mono ?? MONO
  const wordBreak = opts.wordBreak ?? 'keep-all'
  return `
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#e9eaee}
body{font-family:${sans};color:${INK};word-break:${wordBreak};overflow-wrap:break-word;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:${width} ${height};margin:0}
.page{width:${width};height:${height};background:#fff;position:relative;overflow:hidden;break-after:page;page-break-after:always}
.page:last-of-type{break-after:auto;page-break-after:auto}
#flow{position:absolute;left:-10000px;top:0;width:${(isLand ? PAGE_LAND.pxW : PAGE.pxW) - left - right}px;visibility:hidden}
#flow.measuring{visibility:hidden}

/* ── 쪽 크롬 ─────────────────────────────────────────── */
.phead{position:absolute;left:${left}px;right:${right}px;top:${PAGE.headTop}px;display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:${INK3};letter-spacing:0.04em;padding-bottom:8px;border-bottom:1px solid ${LINE}}
.phead .dot{width:8px;height:8px;border-radius:2px;background:${dot};display:inline-block;margin-right:8px;flex:none}
.phead .l{display:flex;align-items:center;min-width:0}
.phead .r{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%;text-align:right}
.parea{position:absolute;left:${left}px;right:${right}px;top:${PAGE.top}px;bottom:${PAGE.bottom}px}
.pfoot{position:absolute;left:${left}px;right:${right}px;bottom:${PAGE.footBottom}px;display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:${INK3};padding-top:8px;border-top:1px solid ${LINE}}
.pfoot .n{font-family:${mono}}
`
}
