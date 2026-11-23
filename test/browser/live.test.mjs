// 실제 브라우저 테스트 — 헤드리스 브라우저를 띄워 작은 문서를 굽고, 책갈피 · 정리(프로세스 · 임시 프로필)를 확인한다.
// 부르는 곳: npm test. 브라우저를 찾지 못하는 환경에서는 건너뛴다(까닭을 남긴다).
// 먼저 읽을 파일: src/browser/chrome.mjs, src/browser/print.mjs.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { describe, test } from 'node:test'
import { browserVersion, withChrome } from '../../src/browser/chrome.mjs'
import { findBrowser } from '../../src/browser/find.mjs'
import { printPdf } from '../../src/browser/print.mjs'

function locateBrowser() {
  try {
    return findBrowser()
  } catch (error) {
    return { skipReason: error.message.split('\n')[0] }
  }
}

const browser = locateBrowser()
const skip = typeof browser === 'string' ? false : browser.skipReason

/** 쪽 나누기 스크립트 대신, 끝났다는 창 변수만 두는 작은 문서. 장 · 절 제목이 하나씩 있다. */
const FINISHED_DOCUMENT =
  '<!doctype html><meta charset="utf-8"><style>@page{size:A4;margin:0}</style>' +
  '<div role="heading" aria-level="1">Chapter one</div><p>Body</p>' +
  '<div style="break-before:page" role="heading" aria-level="2">Section one</div>' +
  '<script>window.__pageCount=2;window.__frontCount=0;window.__anchors={ch0:1};window.__paged=true</script>'

const isAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('실제 브라우저', { skip }, () => {
  test('문서를 구우면 책갈피가 든 PDF 와 조판 정보가 나오고, 끝나면 프로세스와 프로필이 남지 않는다', async () => {
    let info
    const { pdf, meta, version } = await withChrome(async (cdp, launched) => {
      info = launched
      const printed = await printPdf(cdp, FINISHED_DOCUMENT)
      return { ...printed, version: await browserVersion(cdp) }
    })
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
    assert.ok(pdf.includes('/Outlines'), 'bookmarks missing')
    assert.deepEqual(meta, { pages: 2, front: 0, anchors: { ch0: 1 }, err: null, overflow: [] })
    assert.ok(version.major > 0)
    assert.ok(!existsSync(info.profileDir), 'profile folder left behind')
    assert.ok(!isAlive(info.pid), 'browser process left behind')
  })

  test('fn 이 실패해도 프로세스와 프로필을 정리하고 오류를 그대로 던진다', async () => {
    let info
    await assert.rejects(
      () =>
        withChrome(async (_cdp, launched) => {
          info = launched
          throw new Error('stop here')
        }),
      /stop here/,
    )
    assert.ok(!existsSync(info.profileDir))
    assert.ok(!isAlive(info.pid))
  })
})
