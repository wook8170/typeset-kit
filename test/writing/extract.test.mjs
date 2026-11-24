// 대상 글 뽑기 시험 — Markdown · 쪽 HTML · 책 명세에서 독자에게 나가는 글만 뽑는지, 줄 번호가 원본 기준인지 확인한다.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/writing/extract.mjs.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { collectSpecStrings, extractHtml, extractMarkdown, extractSpec } from '../../src/writing/extract.mjs'

const textOf = (lines) => lines.map((entry) => entry.text).join('\n')

describe('Markdown', () => {
  test('코드 블록 · 인라인 코드 · HTML 주석 · front matter 를 빼고 줄 번호를 지킨다', () => {
    const source = ['---', 'title: 강력한 제목', '---', '본문 `강력한` 끝', '```js', '강력한 코드', '```', '<!-- 강력한', '주석 -->', '마지막 줄'].join('\n')
    const lines = extractMarkdown(source)
    assert.equal(lines.length, 10)
    assert.equal(lines[3].text, '본문  끝')
    assert.equal(lines[3].line, 4)
    assert.equal(lines[9].text, '마지막 줄')
    assert.ok(!textOf(lines).includes('강력한'))
  })
  test('인용문은 책의 본문이라 남긴다', () => {
    assert.equal(extractMarkdown('> 인용한 글')[0].text, '> 인용한 글')
  })
  test('코드 블록은 여는 표시와 같은 표시로만 닫는다', () => {
    const lines = extractMarkdown(['~~~', '```', '안쪽', '~~~', '바깥'].join('\n'))
    assert.equal(lines[2].text, '')
    assert.equal(lines[4].text, '바깥')
  })
})

describe('쪽 HTML', () => {
  test('태그 · script · style · pre · code · 주석을 빼고 엔티티를 글자로 바꾼다', () => {
    const html = '<style>.a{}</style>\n<p class="강력한">문단 &amp; <code>강력한</code> 글</p>\n<script>var 강력한 = 1</script><pre>\n강력한\n</pre><!-- 강력한 -->'
    const lines = extractHtml(html)
    assert.ok(!textOf(lines).includes('강력한'))
    assert.equal(lines[1].text.replace(/\s+/g, ' ').trim(), '문단 & 글')
    assert.equal(lines[1].line, 2)
  })
})

describe('책 명세', () => {
  const spec = {
    title: '제목',
    chapters: [
      {
        no: '1',
        title: '장 제목',
        sections: [
          {
            no: '1.1',
            title: '절',
            mono: 'install',
            blocks: [
              { t: 'p', html: '본문 <code>강력한</code> 글' },
              { t: 'code', lines: ['강력한 코드'] },
              { t: 'table', head: ['머리'], rows: [['칸 하나', { html: '칸 둘', span: 2 }]], widths: ['10%'] },
              { t: 'figure', src: 'x.png', caption: '그림 설명', alt: '대체 글' },
            ],
          },
        ],
      },
    ],
  }
  test('글 필드의 문자열만 모으고 이름표 · 경로 · 코드 필드는 뺀다', () => {
    const strings = collectSpecStrings(spec)
    for (const expected of ['제목', '장 제목', '절', '본문 <code>강력한</code> 글', '머리', '칸 하나', '칸 둘', '그림 설명', '대체 글']) assert.ok(strings.includes(expected), expected)
    for (const unexpected of ['1', '1.1', 'install', 'p', 'x.png', '강력한 코드', '10%']) assert.ok(!strings.includes(unexpected), unexpected)
  })
  test('문자열 안의 인라인 코드는 뺀다', () => {
    assert.ok(!textOf(extractSpec(spec)).includes('강력한'))
  })
  test('원본에서 찾으면 그 줄 번호를, 못 찾으면 0 을 준다', () => {
    const source = 'export default {\n  title: "제목",\n  note: "본문 글"\n}'
    const found = extractSpec({ title: '제목', note: '본문 글', other: '없는 글' }, source)
    assert.equal(found.find((entry) => entry.text === '본문 글').line, 3)
    assert.equal(found.find((entry) => entry.text === '없는 글').line, 0)
  })
})
