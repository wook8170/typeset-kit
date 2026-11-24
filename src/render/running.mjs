// 머리글 · 꼬리글 — 설정의 자리표시자 문자열(header · footer)을 쪽 나누기 스크립트의 쪽 크롬 함수로 바꾼다.
// 부르는 곳: render/index.mjs(조판 HTML 의 쪽 정보와 쪽 나누기 선택 사항).
// 먼저 읽을 파일: docs/contract.md 「설정 계약」의 header · footer, render/paginator.mjs 의 makePage 설명.
//
// 자리표시자는 여섯 개다. {title} · {brand} · {edition} 은 문서마다, {chapter} · {section} · {page} 는 쪽마다 정해진다.
// {edition} 은 발행 연월(YYYY.MM)이다.
// 값이 빈 자리표시자는 바로 앞의 글(앞이 없으면 바로 뒤의 글)과 함께 빠진다. 그래서 '{chapter} › {section}' 은
// 절이 없는 쪽에서 장 이름만 남고, 브랜드 이름이 비면 '{brand} {title}' 은 제목만 남는다.

const PLACEHOLDER = /\{(title|brand|edition|chapter|section|page)\}/g

/** 자리표시자 문자열 → 조각 목록. 조각은 글(문자열) 또는 { key } 다. 모르는 {…} 는 글로 둔다. */
export function parseRunning(template) {
  const parts = []
  let last = 0
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (match.index > last) parts.push(template.slice(last, match.index))
    parts.push({ key: match[1] })
    last = match.index + match[0].length
  }
  if (last < template.length) parts.push(template.slice(last))
  return parts
}

/**
 * 조각 목록에 값을 채워 글 한 줄로 만든다(순수 함수).
 * 값이 빈 조각은 바로 앞의 글 조각(앞이 없으면 바로 뒤의 글 조각)과 함께 뺀다.
 */
export function fillRunning(parts, values) {
  const out = []
  const isLiteral = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (typeof part === 'string') {
      out.push(part)
      isLiteral.push(true)
      continue
    }
    const value = values[part.key] || ''
    if (value) {
      out.push(String(value))
      isLiteral.push(false)
    } else if (out.length && isLiteral.at(-1)) {
      out.pop()
      isLiteral.pop()
    } else if (typeof parts[i + 1] === 'string') i++
  }
  return out.join('')
}

/** 쪽 정보(window.__PAGE_META__)의 running 칸 — 머리글 왼쪽 · 오른쪽, 꼬리글 왼쪽 · 오른쪽 네 칸의 조각 목록. */
export function runningSlots({ header, footer }) {
  return [header.left, header.right, footer.left, footer.right].map(parseRunning)
}

// 쪽 나누기 스크립트 안에서 도는 쪽 크롬. 쪽마다 네 칸을 만들고, 장 · 절이 바뀌면 applyHead 로 다시 칠한다.
// 빈 값 처리 규칙은 위 fillRunning 의 소스를 그대로 넣어 쓴다(규칙은 한 벌이다).
const MAKE_PAGE = `  function makePage(state){
    var p = mk('page');
    var h = mk('phead');
    h.innerHTML = '<div class="l"><span class="dot"></span><span></span></div><div class="r"></div>';
    var a = mk('parea');
    var f = mk('pfoot');
    f.innerHTML = '<div></div><div class="n"></div>';
    p.setAttribute('data-label', state.label);
    p.appendChild(h); p.appendChild(a); p.appendChild(f);
    document.getElementById('book').appendChild(p);
    var slots = [h.firstChild.lastChild, h.lastChild, f.firstChild, f.lastChild];
    var made = { page:p, area:a, no:state.no, label:state.label, slots:slots };
    applyHead(made, state.head);
    return made;
  }`
const APPLY_HEAD = `  ${fillRunning.toString()}
  function applyHead(page, head){
    var values = { title: PAGE_META.values.title, brand: PAGE_META.values.brand, edition: PAGE_META.values.edition,
      chapter: head.chapter, section: head.section, page: page.label };
    for (var s = 0; s < page.slots.length; s++) page.slots[s].textContent = fillRunning(PAGE_META.running[s], values);
  }`

/** 쪽 나누기 스크립트 선택 사항 중 쪽 크롬 네 가지. 앞붙임 쪽에는 장 · 절 이름을 쓰지 않는다. */
export const RUNNING_PAGINATOR_OPTIONS = Object.freeze({
  makePage: MAKE_PAGE,
  applyHead: APPLY_HEAD,
  newPageHead: `{ chapter: inFront ? '' : headChapter, section: inFront ? '' : headSection }`,
  sectionHead: `{ chapter: headChapter, section: headSection }`,
})
