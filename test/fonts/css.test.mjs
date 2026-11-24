// 글꼴 시험 — 내장 글꼴 표와 파일, 고지 문서의 해시, 글꼴 CSS 만들기(내장 · 사용자 글꼴 · 없는 파일 · 겹침)를 확인한다.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/fonts/builtin.mjs, src/fonts/css.mjs, fonts/FONTS.md.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { judgeFonts } from '../../src/doctor/judge.mjs'
import { BUILTIN_FONTS } from '../../src/fonts/builtin.mjs'
import { fontCss, PACKAGE_FONTS_DIR, resolveFontSpec } from '../../src/fonts/css.mjs'
import { removeTree } from '../../src/platform.mjs'

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const allBuiltinFiles = () => Object.values(BUILTIN_FONTS).flatMap((font) => font.files.map((file) => join(PACKAGE_FONTS_DIR, file.path)))

describe('내장 글꼴 표', () => {
  test('고정 굵기 400 · 700 두 벌씩이고 파일이 모두 있다', () => {
    assert.deepEqual(Object.keys(BUILTIN_FONTS), ['noto-sans-kr', 'jetbrains-mono'])
    for (const font of Object.values(BUILTIN_FONTS)) assert.deepEqual(font.files.map((file) => file.weight), [400, 700])
    for (const path of allBuiltinFiles()) assert.ok(statSync(path).size > 10000, path)
  })
  test('파일의 sha256 이 fonts/FONTS.md 에 적힌 값과 같다', () => {
    const notes = readFileSync(join(PACKAGE_FONTS_DIR, 'FONTS.md'), 'utf8')
    for (const path of allBuiltinFiles()) assert.ok(notes.includes(sha256(path)), path)
  })
  test('글꼴마다 OFL 전문과 고지 문서가 있다', () => {
    for (const file of ['OFL-NotoSansKR.txt', 'OFL-JetBrainsMono.txt']) assert.match(readFileSync(join(PACKAGE_FONTS_DIR, file), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/i)
    const notices = readFileSync(join(PACKAGE_FONTS_DIR, '../THIRD-PARTY-NOTICES.md'), 'utf8')
    assert.match(notices, /Copyright 2014-2021 Adobe/)
    assert.match(notices, /Copyright 2020 The JetBrains Mono Project Authors/)
  })
  test('doctor 의 글꼴 판정이 기본 설정을 통과시킨다', () => {
    const result = judgeFonts(['builtin:noto-sans-kr', 'builtin:jetbrains-mono'], {
      builtinFonts: BUILTIN_FONTS,
      builtinPath: (path) => join(PACKAGE_FONTS_DIR, path),
      resolveFile: (path) => path,
      fileExists: existsSync,
    })
    assert.equal(result.status, 'ok')
  })
})

describe('글꼴 CSS', () => {
  test('내장 글꼴은 파일 안에 담은 @font-face 두 개씩이고 굵기가 적힌다', () => {
    const css = fontCss(['builtin:noto-sans-kr'])
    assert.equal(css.match(/@font-face/g).length, 2)
    assert.match(css, /font-family:'Noto Sans KR';font-weight:400;font-style:normal;font-display:block;src:url\(data:font\/woff2;base64,/)
    assert.match(css, /font-weight:700/)
    assert.equal(css.match(/url\((?!data:)/g), null)
    assert.ok(css.includes(readFileSync(join(PACKAGE_FONTS_DIR, 'NotoSansKR-700.woff2')).toString('base64')))
  })
  test('같은 글꼴 지정이 겹치면 한 번만 넣는다', () => {
    assert.equal(fontCss(['builtin:jetbrains-mono', 'builtin:jetbrains-mono']).match(/@font-face/g).length, 2)
  })
  test('사용자 글꼴은 root 기준 경로를 읽고 파일 종류에 맞는 형식을 적는다', async () => {
    const root = await mkdtemp(join(tmpdir(), 'typeset-kit-fonts-'))
    await writeFile(join(root, 'my.ttf'), 'ttf-bytes')
    await writeFile(join(root, 'my.woff'), 'woff-bytes')
    const css = fontCss([{ family: "My 'Sans'", files: [{ path: 'my.ttf', weight: 600 }, { path: 'my.woff', weight: '400 800', style: 'italic' }] }], { root })
    assert.match(css, /font-family:'My \\'Sans\\'';font-weight:600;font-style:normal;.*format\('truetype'\)/)
    assert.match(css, /font-weight:400 800;font-style:italic;.*data:font\/woff;base64,.*format\('woff'\)/)
    await removeTree(root)
  })
  test('파일이 없으면 시스템 글꼴로 넘어가지 않고 오류로 멈춘다', () => {
    assert.throws(() => fontCss([{ family: 'Missing', files: [{ path: 'none.woff2' }] }], { root: tmpdir() }), /Font file not found/)
  })
  test('없는 내장 이름 · 지원하지 않는 파일 종류는 오류다', async () => {
    assert.throws(() => resolveFontSpec('builtin:nope', { root: '.' }), /Unknown built-in font: builtin:nope/)
    const root = await mkdtemp(join(tmpdir(), 'typeset-kit-fonts-'))
    await writeFile(join(root, 'font.eot'), 'x')
    assert.throws(() => fontCss([{ family: 'X', files: [{ path: 'font.eot' }] }], { root }), /Unsupported font file type/)
    await removeTree(root)
  })
})
