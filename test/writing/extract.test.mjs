// 대상 글 뽑기 시험 — Markdown · 쪽 HTML · 책 명세에서 독자에게 나가는 글만 뽑는지, 줄 번호가 원본 기준인지 확인한다.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/writing/extract.mjs.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { collectSpecStrings, extractHtml, extractMarkdown, extractSpec } from '../../src/writing/extract.mjs'

const textOf = (lines) => lines.map((entry) => entry.text).join('\n')
/** 덩어리의 첫 줄 번호와 글만 견준다(줄 나눔 정보는 따로 본다). */
const plain = (lines) => lines.map((entry) => ({ line: entry.line, text: entry.text }))

describe('Markdown', () => {
  test('코드 블록 · 인라인 코드 · HTML 주석을 빼고 글 줄만 원본 줄 번호와 함께 돌려준다', () => {
    const source = ['# 제목', '', '본문 `강력한` 끝', '```js', '강력한 코드', '```', '<!-- 강력한', '주석 -->', '마지막 줄'].join('\n')
    const lines = plain(extractMarkdown(source))
    assert.deepEqual(lines, [{ line: 1, text: '제목' }, { line: 3, text: '본문 끝' }, { line: 9, text: '마지막 줄' }])
  })
  test('CRLF 원고도 줄 번호가 같다', () => {
    const lines = plain(extractMarkdown('첫 줄\r\n\r\n```\r\n코드\r\n```\r\n끝 줄\r\n'))
    assert.deepEqual(lines, [{ line: 1, text: '첫 줄' }, { line: 6, text: '끝 줄' }])
  })
  test('인용문 · 목록 · 표 칸 · 그림 캡션은 본문이라 남기고, 꾸밈 표시는 안쪽 글만 남긴다', () => {
    const source = ['> 인용한 **굵은** 글', '', '- 첫 항목', '  이어 쓴 줄', '', '| 머리 | 둘 |', '|---|---|', '| 칸 글 | `코드` |', '', '![대체](a.png "캡션 글")'].join('\n')
    assert.deepEqual(plain(extractMarkdown(source)), [
      { line: 1, text: '인용한 굵은 글' }, { line: 3, text: '첫 항목 이어 쓴 줄' },
      { line: 6, text: '머리' }, { line: 6, text: '둘' }, { line: 8, text: '칸 글' }, { line: 10, text: '대체 캡션 글' },
    ])
  })
  test('문단의 줄은 띄어쓰기로 이어 한 덩어리로 보고, 글자 위치마다 원본 줄을 기억한다', () => {
    const [entry] = extractMarkdown(['앞 문단', '', '첫 줄 게임', '체인저다.   둘째', '셋째 줄'].join('\n')).slice(1)
    assert.equal(entry.text, '첫 줄 게임 체인저다. 둘째 셋째 줄')
    assert.deepEqual(entry.breaks, [{ at: 0, line: 3 }, { at: 7, line: 4 }, { at: 16, line: 5 }])
  })
  test('제목은 조판과 같이 꾸밈 없는 글로 본다(인라인 코드는 글자로, 태그는 뺀다)', () => {
    assert.deepEqual(plain(extractMarkdown('## 게임 <br> `체인저` 장')), [{ line: 1, text: '게임 체인저 장' }])
  })
  test('코드 블록은 여는 표시와 같은 표시로만 닫는다', () => {
    assert.deepEqual(textOf(extractMarkdown(['~~~', '```', '안쪽', '~~~', '바깥'].join('\n'))), '바깥')
  })
  // 굽기(marked)와 검사가 원고를 다르게 읽으면 PDF 에 실리는 글이 검사에서 빠진다. 아래는 그렇게 빠지던 꼴이다.
  const BANNED = '강력한 문장'
  const cases = {
    '한 줄 안에서 닫히는 ``` 인라인 코드 뒤': ['```x``` 는 코드다.', '', BANNED],
    '문단 첫 줄이 ```x``` 로 시작하고 다음 줄로 이어짐': ['```x``` 는 코드다.', BANNED],
    '목록 항목 안 문단이 ```x``` 로 시작한 뒤의 항목': ['- 첫 항목', '', '  ```x``` 는 코드다.', '', `- ${BANNED}`],
    '목록 안 코드 블록 뒤의 항목': ['1. 단계', '', '   ```sh', '   ls', '   ```', '', `2. ${BANNED}`],
    '네 칸 넘게 들여 쓴 ``` 뒤(목록 안 문단)': ['- 항목', '', '      ```', '', BANNED],
    '코드 블록 둘에 걸친 주석 표시 사이': ['```', '<!--', '```', '', BANNED, '', '```', '-->', '```'],
    '인라인 코드로 감싼 주석 표시 사이': [`표기는 \`<!--\` 로 열고 ${BANNED} \`-->\` 로 닫는다.`],
    '이스케이프한 주석 표시 사이': [`\\<!-- ${BANNED} -->`],
    '짝이 안 맞는 백틱 사이': [`\` ${BANNED} \`\``],
    '파일 머리의 --- 묶음 안': ['---', BANNED, '---', '', '본문'],
  }
  for (const [name, source] of Object.entries(cases)) {
    test(`굽기가 본문으로 싣는 글은 검사 대상에 남는다: ${name}`, () => {
      const found = extractMarkdown(source.join('\n')).find((entry) => entry.text.includes(BANNED))
      const at = found?.text.indexOf(BANNED)
      const line = found?.breaks.filter((mark) => mark.at <= at).at(-1).line
      assert.equal(line, source.findIndex((sourceLine) => sourceLine.includes(BANNED)) + 1)
    })
  }
})

describe('쪽 HTML', () => {
  test('태그 · script · style · pre · code · 주석을 빼고 엔티티를 글자로 바꾼다', () => {
    const html = '<style>.a{}</style>\n<p class="강력한">문단 &amp; <code>강력한</code> 글</p>\n<script>var 강력한 = 1</script><pre>\n강력한\n</pre><!-- 강력한 -->'
    const lines = extractHtml(html)
    assert.ok(!textOf(lines).includes('강력한'))
    assert.deepEqual(plain(lines), [{ line: 2, text: '문단 & 글' }])
  })
  test('태그나 줄바꿈이 낀 표현도 이어서 본다. 빈 줄은 덩어리를 나눈다', () => {
    const lines = extractHtml('<p>게임 <b>체인저</b> 문장이\n다음 줄로 이어진다</p>\n\n<p>다른 문단</p>')
    assert.deepEqual(plain(lines), [{ line: 1, text: '게임 체인저 문장이 다음 줄로 이어진다' }, { line: 4, text: '다른 문단' }])
    assert.deepEqual(lines[0].breaks.map((mark) => mark.line), [1, 2])
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
