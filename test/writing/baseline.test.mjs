// 래칫 기준선 시험 — 칸 집계, 늘어남 · 줄어듦 비교, 파일 읽기 · 쓰기(같은 입력은 같은 내용)를 확인한다.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/writing/baseline.mjs.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { removeTree } from '../../src/platform.mjs'
import { compareCells, readBaseline, tallyCells, writeBaseline } from '../../src/writing/baseline.mjs'

const finding = (rule, file, level = 'ratchet') => ({ rule, file, level, line: 1, text: 'x', suggest: '' })

describe('기준선', () => {
  test('ratchet 규칙만 규칙 × 파일 칸으로 센다', () => {
    const cells = tallyCells([finding('hype', 'a.md'), finding('hype', 'a.md'), finding('hype', 'b.md'), finding('noun-chain', 'a.md', 'warn'), finding('ai-trace', 'a.md', 'fail')])
    assert.deepEqual(cells, { hype: { 'a.md': 2, 'b.md': 1 } })
  })
  test('늘어난 칸과 줄어든 칸을 가르고, 새 칸은 0 에서 늘어난 것이다', () => {
    const baseline = { hype: { 'a.md': 2, 'b.md': 1 } }
    const current = { hype: { 'a.md': 3, 'b.md': 0 }, metaphor: { 'a.md': 1 } }
    const { regressed, improved } = compareCells(baseline, current)
    assert.deepEqual(regressed, [{ rule: 'hype', file: 'a.md', was: 2, now: 3 }, { rule: 'metaphor', file: 'a.md', was: 0, now: 1 }])
    assert.deepEqual(improved, [{ rule: 'hype', file: 'b.md', was: 1, now: 0 }])
  })
  test('같으면 늘지도 줄지도 않는다', () => {
    assert.deepEqual(compareCells({ hype: { 'a.md': 2 } }, { hype: { 'a.md': 2 } }), { regressed: [], improved: [] })
  })
  test('쓰고 읽으면 같은 칸이 나오고, 같은 입력은 같은 내용을 쓴다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'typeset-kit-baseline-'))
    const path = join(dir, 'baseline.json')
    const cells = { metaphor: { 'z.md': 1 }, hype: { 'b.md': 1, 'a.md': 2 } }
    assert.equal(writeBaseline(path, cells), 4)
    const first = await readFile(path, 'utf8')
    writeBaseline(path, { hype: { 'a.md': 2, 'b.md': 1 }, metaphor: { 'z.md': 1 } })
    assert.equal(await readFile(path, 'utf8'), first)
    assert.deepEqual(readBaseline(path), { hype: { 'a.md': 2, 'b.md': 1 }, metaphor: { 'z.md': 1 } })
    await removeTree(dir)
  })
  test('파일이 없으면 null, 깨졌거나 모르는 꼴이면 오류다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'typeset-kit-baseline-'))
    assert.equal(readBaseline(join(dir, 'none.json')), null)
    await writeFile(join(dir, 'broken.json'), '{ nope')
    assert.throws(() => readBaseline(join(dir, 'broken.json')), /not valid JSON/)
    await writeFile(join(dir, 'old.json'), '{"version":9,"rules":{}}')
    assert.throws(() => readBaseline(join(dir, 'old.json')), /unknown format/)
    await removeTree(dir)
  })
})
