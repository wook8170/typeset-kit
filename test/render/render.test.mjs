// 렌더 단위 테스트 — 차례 · 책갈피 제목 요소, 표지 설정, 머리글 · 꼬리글 자리표시자, 언어 묶음, 본문 HTML, 오류.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/render/index.mjs, src/render/running.mjs.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { deriveIssue, fillRunning, parseRunning, renderBlock, renderBody, renderPrintHtml } from '../../src/render/index.mjs'
import { localeWords } from '../../src/render/locale/index.mjs'
import ko from '../../src/render/locale/ko.mjs'
import en from '../../src/render/locale/en.mjs'
import { variantSettings, virtualSpec } from '../fixtures/virtual-book.mjs'

const html = (spec = virtualSpec(), settings = variantSettings('plain'), options = {}) => renderPrintHtml(spec, { settings, ...options })
const pageMetaOf = (text) => JSON.parse(/window\.__PAGE_META__=(.*?);<\/script>/.exec(text)[1])

describe('차례와 책갈피', () => {
  test('차례 줄 수 = 장 + 절 수, 줄마다 있는 앵커로 가는 링크', () => {
    const spec = virtualSpec()
    const out = html(spec)
    const rows = [...out.matchAll(/<a class="(tocch|tocsec)" href="#([^"]+)">/g)]
    const sectionCount = spec.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0)
    assert.equal(rows.length, spec.chapters.length + sectionCount)
    for (const [, , id] of rows) assert.ok(out.includes(`id="${id}"`), `no anchor ${id}`)
  })
  test('책갈피 제목 요소는 문서 정보 · 차례 · 장(1단계)과 절(2단계)뿐이고, 소제목은 제목 요소가 아니다', () => {
    const spec = virtualSpec()
    const out = html(spec)
    assert.doesNotMatch(out, /<h[1-6][\s>]/)
    assert.equal((out.match(/role="heading" aria-level="1"/g) || []).length, 2 + spec.chapters.length)
    assert.equal((out.match(/role="heading" aria-level="2"/g) || []).length, spec.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0))
    assert.match(out, /<span class="bsecmono" aria-hidden="true">prepare<\/span>/)
  })
  test('문서 정보가 없으면 그 쪽을 만들지 않고, 부록 번호는 넓은 칸을 쓴다', () => {
    const spec = { ...virtualSpec(), docInfo: undefined }
    const out = html(spec)
    assert.ok(!out.includes('id="docinfo"'))
    assert.ok(out.includes('<span class="tocsn apx">부록 A</span>'))
  })
  test('장 표지 절 목록: sectionListMax 를 넘는 장은 목록 대신 개수 한 줄', () => {
    const out = html(virtualSpec(), variantSettings('options'))
    assert.ok(out.includes('이 장의 절 24개는 차례에서 볼 수 있다.'))
    assert.ok(html().includes('<div class="copseclabel">이 장의 절</div><div class="copsecs">'))
  })
})

describe('표지', () => {
  test('메타 칸 · 다루는 것 · 발행처는 설정에서, 판은 개정 이력의 마지막 날짜 행에서 온다', () => {
    const out = html()
    assert.ok(out.includes('<div class="cvk">문서번호</div><div class="cvv">DOC-01</div>'))
    assert.ok(out.includes('<span class="cvt">설정 항목</span>'))
    assert.ok(out.includes('<div class="cvfoot"><div>Acme Inc. · https://example.com</div>'))
    assert.ok(out.includes('<div class="cvrev">2026.03 · 1.1</div>'))
    assert.ok(out.includes('<div class="cven">SERVER INSTALLATION</div>'))
    assert.ok(!out.includes('class="cvmark"'), '로고가 없으면 마크 자리를 비운다')
    assert.ok(!out.includes('cvappr'), '결재 칸은 켤 때만')
  })
  test('결재 칸은 설정의 낱말로 만들고, 로고 SVG 는 마크 자리에 넣는다', () => {
    const logo = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'
    const out = html(virtualSpec(), variantSettings('options'), { logoSvg: logo })
    for (const word of ['<th>작성</th>', '<th>검토</th>', '<th>승인</th>', '이름 / 서명', '날짜']) assert.ok(out.includes(word), word)
    assert.ok(out.includes('.cvappr{grid-column:2'))
    assert.ok(out.includes('<div class="cvmark"><svg width="100%" height="100%" xmlns='))
  })
  test('표지 글은 이스케이프한다', () => {
    const settings = variantSettings('plain', { cover: { meta: [['<b>', 'a&b']] }, brand: { name: '<x>' } })
    const out = html(virtualSpec(), settings)
    assert.ok(out.includes('<div class="cvk">&lt;b&gt;</div><div class="cvv">a&amp;b</div>'))
    assert.ok(out.includes('<div class="cvname">&lt;x&gt;</div>') && out.includes('<title>&lt;x&gt; 서버 설치 안내서</title>'))
  })
})

describe('머리글 · 꼬리글', () => {
  test('자리표시자를 조각으로 나누고, 빈 값은 앞의 글과 함께 뺀다', () => {
    const parts = parseRunning('{chapter} › {section}')
    assert.deepEqual(parts, [{ key: 'chapter' }, ' › ', { key: 'section' }])
    assert.equal(fillRunning(parts, { chapter: '1. 설치', section: '1.1 준비' }), '1. 설치 › 1.1 준비')
    assert.equal(fillRunning(parts, { chapter: '1. 설치', section: '' }), '1. 설치')
    assert.equal(fillRunning(parts, { chapter: '', section: '' }), '')
    const footer = parseRunning('{brand} {title} · {edition}')
    assert.equal(fillRunning(footer, { brand: '', title: '안내서', edition: '2026.03' }), '안내서 · 2026.03', '앞이 비면 뒤의 글을 뺀다')
    assert.equal(fillRunning(footer, { brand: 'Acme', title: '안내서', edition: '' }), 'Acme 안내서')
    assert.equal(fillRunning(parseRunning('p. {page} / {unknown}'), { page: '3' }), 'p. 3 / {unknown}', '모르는 자리표시자는 글로 둔다')
  })
  test('쪽 정보에 네 칸의 조각과 문서 값(제목 · 브랜드 · 발행 연월)이 들어간다', () => {
    const settings = variantSettings('plain', { header: { left: '{brand}', right: '{section}' }, footer: { left: '{title}', right: 'p. {page}' } })
    const meta = pageMetaOf(html(virtualSpec(), settings))
    assert.deepEqual(meta.running, [[{ key: 'brand' }], [{ key: 'section' }], [{ key: 'title' }], ['p. ', { key: 'page' }]])
    assert.deepEqual(meta.values, { title: '서버 설치 안내서', brand: 'Acme Docs', edition: '2026.03' })
  })
  test('쪽 정보 JSON 은 스크립트를 닫지 못한다', () => {
    const out = html({ ...virtualSpec(), title: '</script><b>' })
    assert.ok(out.includes('\\u003c/script>\\u003cb>'))
    assert.equal((out.match(/<\/script>/g) || []).length, 2)
  })
})

describe('언어 묶음', () => {
  test('두 묶음은 같은 키를 가진다', () => {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(ko).sort())
    assert.deepEqual(Object.keys(en.callouts).sort(), Object.keys(ko.callouts).sort())
  })
  test('영어 문서는 영어 낱말 · lang="en" · 기본 줄바꿈을 쓴다', () => {
    const out = html(virtualSpec(), variantSettings('plain', { locale: 'en' }))
    assert.ok(out.includes('<html lang="en">'))
    for (const word of ['>Contents<', '>Revision history<', '<div class="bcokind">Caution</div>', 'Figure 1-1 · ', 'Table 1-1 · ', '<b>Sources</b>']) assert.ok(out.includes(word), word)
    assert.ok(out.includes('word-break:normal') && !out.includes('word-break:keep-all'))
  })
  test('낱말 단위로 덮어쓸 수 있고, 모르는 locale 은 오류다', () => {
    const words = localeWords('ko', { figure: 'Fig.', callouts: { note: '메모' } })
    assert.equal(words.figure, 'Fig.')
    assert.equal(words.callouts.note, '메모')
    assert.equal(words.callouts.warning, '경고')
    assert.throws(() => localeWords('jp'), /Unknown locale: jp/)
  })
})

describe('블록과 본문', () => {
  test('콜아웃: 설정으로 더한 종류는 그 색과 이름을 쓰고, 모르는 종류는 오류다', () => {
    const settings = variantSettings('plain', { theme: { callouts: { tip: 'oklch(0.5 0.1 150)' } } })
    assert.equal(renderBlock({ t: 'callout', kind: 'tip', html: 'x' }, { settings }), '<div class="bcallout" style="--co:oklch(0.5 0.1 150)"><div class="bcokind">tip</div><div class="bcobody">x</div></div>')
    assert.throws(() => renderBlock({ t: 'callout', kind: 'tip', html: 'x' }, { settings: variantSettings('plain') }), /Unknown callout kind: tip/)
    assert.throws(() => renderBlock({ t: 'nope' }, { settings }), /Unknown block type: nope/)
  })
  test('글 필드는 이스케이프하고 마크업 필드는 그대로 넣는다', () => {
    const settings = variantSettings('plain')
    assert.equal(renderBlock({ t: 'h3', text: 'a<b>' }, { settings }), '<div class="bh3" data-keep="next">a&lt;b&gt;</div>')
    assert.equal(renderBlock({ t: 'p', html: '<b>x</b>' }, { settings }), '<p class="bp"><b>x</b></p>')
    assert.equal(renderBlock({ t: 'code', lines: 'a < b\nc' }, { settings }), '<pre class="bcode">a &lt; b\nc</pre>')
  })
  test('확장 블록은 넘긴 렌더 함수가 그린다', () => {
    const out = renderBlock({ t: 'storyboard', id: 'x' }, { settings: variantSettings('plain'), renderers: { storyboard: (block) => `<div class="bsb">${block.id}</div>` } })
    assert.equal(out, '<div class="bsb">x</div>')
  })
  test('본문 HTML 은 장 머리와 절만 있고 쪽 크롬 · 스크립트 · 표지가 없다', () => {
    const body = renderBody(virtualSpec(), { settings: variantSettings('plain') })
    assert.ok(body.startsWith('<div class="bchapter" id="ch0" role="heading" aria-level="1"><span class="bchno">1</span>'))
    assert.ok(body.includes('id="ch0s0"') && body.includes('id="ch3s0"'))
    assert.ok(!body.includes('<script') && !body.includes('class="page') && !body.includes('tocch'))
  })
  test('settings 가 없으면 알린다', () => {
    assert.throws(() => renderPrintHtml(virtualSpec(), {}), /options\.settings is required/)
  })
})

test('발행 정보는 가장 늦은 날짜 행에서 뽑고, 날짜 행이 없으면 비운다', () => {
  assert.deepEqual(deriveIssue([['1.0', '2026-01-05'], ['0.9', '초안'], ['1.1', '2026-03-10']]), { issued: '2026-03-10', month: '2026.03', edition: '2026.03 · 1.1' })
  assert.deepEqual(deriveIssue([['0.9', '초안']]), { issued: '', month: '', edition: '' })
  assert.deepEqual(deriveIssue(), { issued: '', month: '', edition: '' })
})
