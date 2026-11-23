// 단계 불러오기 단위 테스트 — 단계 파일이 없을 때만 「아직 없음」으로 바꾸고, 안쪽 가져오기 실패는 그대로 던지는지 본다.
// 부르는 곳: npm test.
// 먼저 읽을 파일: src/stages.mjs.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, test } from 'node:test'
import { removeTree } from '../src/platform.mjs'
import { importStage, NotImplementedError, STAGE_FILES } from '../src/stages.mjs'

describe('단계 불러오기', () => {
  test('단계 파일이 없으면 NotImplementedError 다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'typeset-kit-test-'))
    const baseUrl = pathToFileURL(join(dir, 'stages.mjs')).href
    await assert.rejects(() => importStage('check', { baseUrl }), (error) => error instanceof NotImplementedError && error.file === STAGE_FILES.check)
    await removeTree(dir)
  })
  test('단계 파일이 가져오는 다른 파일이 없으면 원래 오류를 던진다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'typeset-kit-test-'))
    await mkdir(join(dir, 'check'))
    await writeFile(join(dir, 'check', 'index.mjs'), "import './missing-helper.mjs'")
    const baseUrl = pathToFileURL(join(dir, 'stages.mjs')).href
    await assert.rejects(() => importStage('check', { baseUrl }), (error) => error.code === 'ERR_MODULE_NOT_FOUND' && !(error instanceof NotImplementedError))
    await removeTree(dir)
  })
  test('단계 파일이 있으면 그 모듈을 돌려준다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'typeset-kit-test-'))
    await mkdir(join(dir, 'check'))
    await writeFile(join(dir, 'check', 'index.mjs'), 'export const checkPdfs = () => 1')
    const loaded = await importStage('check', { baseUrl: pathToFileURL(join(dir, 'stages.mjs')).href })
    assert.equal(loaded.checkPdfs(), 1)
    await removeTree(dir)
  })
  test('모르는 단계 이름은 오류다', async () => {
    await assert.rejects(() => importStage('nope'), /Unknown stage/)
  })
})
