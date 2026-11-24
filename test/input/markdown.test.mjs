// Markdown 변환 시험 — 장 · 절 · 소제목 나누기, 블록 종류마다의 변환, 이스케이프 · 링크 규칙, 번호 붙이기, 오류.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/input/markdown.mjs, src/input/markdown-blocks.mjs.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { calloutKind, figureSource } from '../../src/input/markdown-blocks.mjs'
import { isSafeHref } from '../../src/input/markdown-inline.mjs'
import { markdownToSpec, MarkdownError, mergeParts, parseMarkdown } from '../../src/input/markdown.mjs'
import { validateSpec } from '../../src/spec/contract.mjs'

const KINDS = { note: '참고', caution: '주의', warning: '경고' }
const convert = (text, options = {}) => markdownToSpec(text, { kindNames: KINDS, ...options })
const blocksOf = (text) => convert(`# 문서\n\n## 장\n\n### 절\n\n${text}`).chapters[0].sections[0].blocks

describe('제목 구조', () => {
  test('# 은 문서 제목, ## 앞 문단은 표지 요약, ## 바로 아래 첫 문단은 장 요약이다', () => {
    const spec = convert('# 안내서\n\n첫 요약.\n\n둘째 요약.\n\n## 시작\n\n장 요약.\n\n### 설치\n\n본문.\n\n#### 소제목\n\n뒤 문단.\n')
    assert.equal(spec.title, '안내서')
    assert.equal(spec.lede, '첫 요약.<br>둘째 요약.')
    assert.equal(spec.chapters[0].summary, '장 요약.')
    assert.deepEqual(spec.chapters[0].sections[0].blocks, [{ t: 'p', html: '본문.' }, { t: 'h3', text: '소제목' }, { t: 'p', html: '뒤 문단.' }])
    assert.deepEqual(validateSpec(spec), [])
  })
  test('장 · 절 번호를 자동으로 붙이고, 장 머리와 첫 절 사이의 블록은 장 이름의 절에 담는다', () => {
    const spec = convert('# 문서\n\n## 하나\n\n요약.\n\n- 목록\n\n### 가\n\n## 둘\n\n### 나\n\n### 다\n')
    assert.deepEqual(spec.chapters.map((chapter) => [chapter.no, chapter.sections.map((section) => `${section.no} ${section.title}`)]), [
      ['1', ['1.1 하나', '1.2 가']],
      ['2', ['2.1 나', '2.2 다']],
    ])
  })
  test('제목 글의 꾸밈은 지우고 글만 남긴다(렌더가 이스케이프한다)', () => {
    const spec = convert('# **굵은** `코드` 제목 <b>\n\n## 장 & 절\n')
    assert.equal(spec.title, '굵은 코드 제목')
    assert.equal(spec.chapters[0].title, '장 & 절')
  })
  test('제목이 없으면 문서 설정의 제목을 쓰고, 그것도 없으면 오류다', () => {
    assert.equal(convert('## 장\n', { title: '설정 제목' }).title, '설정 제목')
    assert.throws(() => convert('## 장\n'), MarkdownError)
  })
  test('첫 ## 앞에 문단이 아닌 블록이나 절이 오면 오류다', () => {
    assert.throws(() => convert('# 문서\n\n- 목록\n'), /only paragraphs/)
    assert.throws(() => convert('# 문서\n\n### 절\n'), /before the first chapter/)
  })
  test('원고 여러 편을 합치면 장 번호가 이어진다', () => {
    const parts = [parseMarkdown('# 문서\n\n## 하나\n'), parseMarkdown('## 둘\n\n### 절\n')]
    const spec = mergeParts(parts)
    assert.deepEqual(spec.chapters.map((chapter) => chapter.no), ['1', '2'])
    assert.equal(spec.chapters[1].sections[0].no, '2.1')
  })
})

describe('블록', () => {
  test('문단 · 굵게 · 코드 · 줄바꿈 한 번은 띄어쓰기', () => {
    assert.deepEqual(blocksOf('**굵게** 와 `a<b>`\n다음 줄'), [{ t: 'p', html: '<strong>굵게</strong> 와 <code>a&lt;b&gt;</code> 다음 줄' }])
  })
  test('작성자가 쓴 HTML 은 글자로 이스케이프하고 주석은 지운다', () => {
    assert.deepEqual(blocksOf('글 <b onclick="x">굵게</b> <!-- 메모 --> 끝\n\n<div>블록</div>\n\n<!-- 블록 주석 -->'), [
      { t: 'p', html: '글 &lt;b onclick=&quot;x&quot;&gt;굵게&lt;/b&gt;  끝' },
      { t: 'p', html: '&lt;div&gt;블록&lt;/div&gt;' },
    ])
  })
  test('링크는 http · https · mailto · # 만 남기고, 나머지는 글자만 남긴다', () => {
    assert.deepEqual(blocksOf('[가](https://example.com "제목") [나](javascript:alert(1)) [다](other.md)'), [
      { t: 'p', html: '<a href="https://example.com" title="제목">가</a> 나 다' },
    ])
    assert.equal(isSafeHref('mailto:a@example.com'), true)
    assert.equal(isSafeHref('#ch1'), true)
    assert.equal(isSafeHref(' JavaScript:x'), false)
  })
  test('글머리 목록은 겹친 목록을 HTML 목록으로, 번호 목록은 코드를 항목의 code 칸으로', () => {
    assert.deepEqual(blocksOf('- 가\n  - 나\n- 다\n\n3. 셋\n   ```sh\n   ls -l\n   ```\n4. 넷\n'), [
      { t: 'ul', items: ['가 <ul><li>나</li></ul>', '다'] },
      { t: 'ol', items: [{ html: '셋', code: 'ls -l' }, '넷'], start: 3 },
    ])
  })
  test('코드 블록은 줄 목록, 표는 머리와 행, 가운데 정렬 칸은 align', () => {
    assert.deepEqual(blocksOf('```js\nconst a = 1\n<b>\n```\n\n| 가 | 나 |\n|:-:|---|\n| `1` | **2** |\n'), [
      { t: 'code', lines: ['const a = 1', '<b>'] },
      { t: 'table', head: [{ html: '가', align: 'center' }, '나'], rows: [[{ html: '<code>1</code>', align: 'center' }, '<strong>2</strong>']] },
    ])
  })
  test('인용문은 콜아웃. 첫 낱말이 굵은 종류 이름이면 그 종류, 아니면 note', () => {
    assert.deepEqual(blocksOf('> **주의** 조심한다.\n> 다음 줄\n\n> **Warning:** 영어 키\n\n> 그냥 인용\n>\n> 둘째 문단'), [
      { t: 'callout', kind: 'caution', html: '조심한다. 다음 줄' },
      { t: 'callout', kind: 'warning', html: '영어 키' },
      { t: 'callout', kind: 'note', html: '그냥 인용<br>둘째 문단' },
    ])
  })
  test('콜아웃 종류 판정은 굵게 쓴 첫 낱말만 본다', () => {
    assert.equal(calloutKind([{ type: 'text', text: '주의 글' }], KINDS).kind, null)
    assert.equal(calloutKind([{ type: 'strong', tokens: [{ type: 'text', text: '모름' }] }], KINDS).kind, null)
  })
  test('그림 하나만 있는 문단은 그림 블록, 번호는 장마다 1 부터, SVG 는 inline', () => {
    const spec = convert('# 문서\n\n## 장\n\n### 절\n\n![첫 그림](img/a.svg)\n\n![둘째 *그림*](img/b.png "캡션 제목")\n\n글 안의 ![작은](x.png) 그림\n\n## 둘\n\n### 절\n\n![셋째](c.png)\n', { imageBase: 'docs' })
    assert.deepEqual(spec.chapters[0].sections[0].blocks, [
      { t: 'figure', src: 'docs/img/a.svg', caption: '첫 그림', alt: '첫 그림', inline: true, num: '1-1' },
      { t: 'figure', src: 'docs/img/b.png', caption: '캡션 제목', alt: '둘째 그림', num: '1-2' },
      { t: 'p', html: '글 안의 작은 그림' },
    ])
    assert.equal(spec.chapters[1].sections[0].blocks[0].num, '2-1')
  })
  test('그림 경로: 원고 폴더 기준 상대 경로를 root 기준으로, data · 바깥 주소 · 절대 경로는 그대로', () => {
    assert.equal(figureSource('../img/a.png', 'docs/guide'), 'docs/img/a.png')
    assert.equal(figureSource('a.png', ''), 'a.png')
    assert.equal(figureSource('data:image/png;base64,AA', 'docs'), 'data:image/png;base64,AA')
    assert.equal(figureSource('https://example.com/a.png', 'docs'), 'https://example.com/a.png')
    assert.equal(figureSource('/abs/a.png', 'docs'), '/abs/a.png')
    assert.equal(figureSource('C:\\img\\a.png', 'docs'), 'C:\\img\\a.png')
  })
  test('가로줄은 블록을 만들지 않는다', () => {
    assert.deepEqual(blocksOf('가\n\n---\n\n나'), [{ t: 'p', html: '가' }, { t: 'p', html: '나' }])
  })
})
