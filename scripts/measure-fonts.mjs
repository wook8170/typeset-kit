// 글꼴 실측 — 같은 문서를 고정 굵기 글꼴과 가변 글꼴로 구워 PDF 의 글꼴 종류 · 크기 · 굵기 표현을 비교한다.
// 부르는 곳: 사람이 직접(`node scripts/measure-fonts.mjs --variable <가변 woff2> --out <폴더>`). 헤드리스 브라우저를 한 번 띄운다.
// 먼저 읽을 파일: src/fonts/css.mjs(글꼴 CSS), src/browser/print.mjs(굽기).
import { mkdirSync, writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { withChrome } from '../src/browser/chrome.mjs'
import { printPdf } from '../src/browser/print.mjs'
import { fontCss } from '../src/fonts/css.mjs'

const WEIGHTS = [400, 500, 600, 700, 800]
const SAMPLE = '가나다라마바사 한글 조판 시험 문장입니다. 표·그림·차트 — “따옴표” 숫자 0123456789 ABC abc.'

/** 굵기별 줄이 든 문서. 마지막에 끝났다는 창 변수를 둔다. */
function sampleDocument(css) {
  const rows = WEIGHTS.map((weight) => `<p style="font-weight:${weight}">${weight} ${SAMPLE}</p>`).join('')
  const mono = [400, 700].map((weight) => `<pre style="font-weight:${weight}">${weight} const value = 'mono'; // 0123456789</pre>`).join('')
  return (
    `<!doctype html><meta charset="utf-8"><style>@page{size:A4;margin:12mm}${css}` +
    `body{font-family:'Noto Sans KR',sans-serif;font-size:14pt}pre{font-family:'JetBrains Mono',monospace;font-size:11pt}</style>` +
    `${rows}${mono}<script>window.__pageCount=1;window.__frontCount=0;window.__anchors={};window.__paged=true</script>`
  )
}

function variableCss(variablePath) {
  const base64 = readFileSync(variablePath).toString('base64')
  return `@font-face{font-family:'Noto Sans KR';font-weight:400 800;font-style:normal;font-display:block;src:url(data:font/woff2;base64,${base64}) format('woff2')}`
}

const { values } = parseArgs({ options: { variable: { type: 'string' }, out: { type: 'string' } } })
if (!values.variable || !values.out) {
  process.stderr.write('usage: node scripts/measure-fonts.mjs --variable <NotoSansKR-Variable.woff2> --out <folder>\n')
  process.exit(2)
}
mkdirSync(values.out, { recursive: true })
const mono = fontCss(['builtin:jetbrains-mono'])
const documents = {
  fixed: sampleDocument(`${fontCss(['builtin:noto-sans-kr'])}\n${mono}`),
  variable: sampleDocument(`${variableCss(resolve(values.variable))}\n${mono}`),
}
await withChrome(async (cdp) => {
  for (const [name, html] of Object.entries(documents)) {
    const { pdf } = await printPdf(cdp, html)
    writeFileSync(resolve(values.out, `${name}.pdf`), pdf)
    process.stdout.write(`${name}.pdf ${pdf.length} bytes\n`)
  }
})
