// 글꼴 CSS 만들기 — 글꼴 지정(내장 이름 또는 파일 목록)을 파일 안에 담은 @font-face 규칙으로 바꾼다.
// 부르는 곳: 조판 모드(modes/*)가 문서 HTML 에 글꼴을 넣을 때.
// 먼저 읽을 파일: fonts/builtin.mjs(내장 글꼴 표).
import { readFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUILTIN_FONTS } from './builtin.mjs'

/** 패키지에 든 글꼴 폴더. */
export const PACKAGE_FONTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../fonts')

const FORMATS = {
  '.woff2': { mime: 'font/woff2', format: 'woff2' },
  '.woff': { mime: 'font/woff', format: 'woff' },
  '.ttf': { mime: 'font/ttf', format: 'truetype' },
  '.otf': { mime: 'font/otf', format: 'opentype' },
}

/** 글꼴 지정 하나를 { family, files: [{ absolutePath, weight, style }] } 로 풀어 쓴다. 내장 이름이 표에 없으면 오류다. */
export function resolveFontSpec(spec, { root, fontsDir = PACKAGE_FONTS_DIR }) {
  if (typeof spec === 'string') {
    const entry = BUILTIN_FONTS[spec.slice('builtin:'.length)]
    if (!entry) throw new Error(`Unknown built-in font: ${spec}`)
    return { family: entry.family, files: entry.files.map((file) => ({ ...file, absolutePath: resolve(fontsDir, file.path) })) }
  }
  return { family: spec.family, files: spec.files.map((file) => ({ style: 'normal', weight: 400, ...file, absolutePath: resolve(root, file.path) })) }
}

function fontFaceRule(family, file) {
  const format = FORMATS[extname(file.absolutePath).toLowerCase()]
  if (!format) throw new Error(`Unsupported font file type: ${file.path ?? file.absolutePath}`)
  let bytes
  try {
    bytes = readFileSync(file.absolutePath)
  } catch (error) {
    // 시스템 글꼴로 조용히 바뀌면 머신마다 결과가 달라진다. 파일이 없으면 굽기를 멈춘다.
    throw new Error(`Font file not found: ${file.absolutePath}`, { cause: error })
  }
  const familyName = family.replaceAll("'", "\\'")
  return (
    `@font-face{font-family:'${familyName}';font-weight:${file.weight};font-style:${file.style};font-display:block;` +
    `src:url(data:${format.mime};base64,${bytes.toString('base64')}) format('${format.format}')}`
  )
}

/** 글꼴 지정 목록 → @font-face CSS. 같은 글꼴 지정이 겹치면 한 번만 넣는다. */
export function fontCss(fontSpecs, { root = process.cwd(), fontsDir } = {}) {
  const seen = new Set()
  const rules = []
  for (const spec of fontSpecs) {
    const resolved = resolveFontSpec(spec, { root, fontsDir })
    for (const file of resolved.files) {
      const key = `${resolved.family}|${file.weight}|${file.style}|${file.absolutePath}`
      if (seen.has(key)) continue
      seen.add(key)
      rules.push(fontFaceRule(resolved.family, file))
    }
  }
  return rules.join('\n')
}
