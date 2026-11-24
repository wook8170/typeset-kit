// 규칙 파일 해시 시험 — rules/ko.mjs · en.mjs 가 기록된 정본 해시와 같은지, 달라지면 알리는지 확인한다.
// 부르는 곳: npm test. 릴리스 점검은 scripts/check-rules-hash.mjs 가 정본 폴더와도 대조한다.
// 먼저 읽을 파일: src/writing/rule-sources.mjs, rules/SOURCE.json.
import assert from 'node:assert/strict'
import { cp, mkdtemp, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { removeTree } from '../../src/platform.mjs'
import { verifyRuleSources } from '../../src/writing/rule-sources.mjs'

const RULES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../rules')

describe('규칙 파일 해시', () => {
  test('패키지의 사본은 기록된 해시와 같다', () => {
    assert.deepEqual(verifyRuleSources(RULES_DIR), [])
  })
  test('사본이 바뀌면 문제로 알린다', async () => {
    const copy = await mkdtemp(join(tmpdir(), 'typeset-kit-rules-'))
    await cp(RULES_DIR, copy, { recursive: true })
    await appendFile(join(copy, 'ko.mjs'), '// changed\n')
    const problems = verifyRuleSources(copy)
    assert.equal(problems.length, 1)
    assert.match(problems[0], /ko\.mjs: copy differs/)
    await removeTree(copy)
  })
  test('정본 폴더를 주면 정본과도 견준다', async () => {
    const upstream = await mkdtemp(join(tmpdir(), 'typeset-kit-upstream-'))
    await cp(join(RULES_DIR, 'ko.mjs'), join(upstream, 'rules-ko.mjs'))
    await cp(join(RULES_DIR, 'en.mjs'), join(upstream, 'rules-en.mjs'))
    assert.deepEqual(verifyRuleSources(RULES_DIR, upstream), [])
    await appendFile(join(upstream, 'rules-en.mjs'), '// upstream changed\n')
    assert.match(verifyRuleSources(RULES_DIR, upstream)[0], /en\.mjs: upstream rules-en\.mjs differs/)
    await removeTree(upstream)
  })
})
