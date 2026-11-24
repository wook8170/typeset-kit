// 그림 줄이기 — 긴 변이 상한을 넘는 PNG 를 조판에 쓰는 같은 헤드리스 브라우저의 캔버스로 줄인다.
// 부르는 곳: input/images.mjs(그림 파일을 data 주소로 바꿀 때).
// 먼저 읽을 파일: input/png.mjs(줄일 크기 판정).
//
// 줄이는 까닭: Chrome 은 PNG 를 PDF 에 넣을 때 다시 압축해 파일이 원본보다 몇 배 커진다. 그래서 조판 전에 줄인다.
// 조판 크기(CSS px)는 원본 파일로 정하므로 줄여도 쪽 배치는 바뀌지 않는다.

import { readFile } from 'node:fs/promises'
import { closeTab } from '../browser/print.mjs'
import { pngHeader, shrinkSize } from './png.mjs'

/** 큰 응답을 한 번에 받으면 돌아오지 않는 경우가 있어 결과 data 주소를 이 크기씩 나눠 받는다. */
const CHUNK = 512 * 1024

function canvasExpression(source, size) {
  return (
    `(async()=>{const i=new Image();i.src=${JSON.stringify(source)};await i.decode();` +
    `const c=document.createElement('canvas');c.width=${size.width};c.height=${size.height};const g=c.getContext('2d');` +
    `g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(i,0,0,${size.width},${size.height});` +
    `window.__shrunk=c.toDataURL('image/png');return window.__shrunk.length})()`
  )
}

async function readChunked(call, length) {
  let uri = ''
  for (let at = 0; at < length; at += CHUNK) {
    const part = await call('Runtime.evaluate', { expression: `window.__shrunk.slice(${at},${at + CHUNK})`, returnByValue: true })
    uri += part.result.value
  }
  return Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64')
}

/**
 * 그림 읽개를 만든다. cdp 가 없거나 maxPx 가 0 이면 줄이지 않고 읽기만 한다.
 * 돌려주는 값 = { load(절대 경로) → Promise<Buffer>, close() }. 같은 파일은 한 번만 읽고 줄인다.
 */
export async function createImageReader({ cdp = null, maxPx = 0 } = {}) {
  const tab = cdp && maxPx > 0 ? await openTab(cdp) : null
  const cache = new Map()
  const loadOne = async (file) => {
    const bytes = await readFile(file)
    const header = file.toLowerCase().endsWith('.png') ? pngHeader(bytes) : null
    const size = header && tab ? shrinkSize(header.width, header.height, maxPx) : null
    if (!size) return bytes
    const answer = await tab.call('Runtime.evaluate', {
      expression: canvasExpression(`data:image/png;base64,${bytes.toString('base64')}`, size), awaitPromise: true, returnByValue: true,
    })
    if (answer.exceptionDetails) throw new Error(`Could not shrink image ${file}: ${answer.exceptionDetails.text}`)
    return readChunked(tab.call, answer.result.value)
  }
  return {
    load(file) {
      if (!cache.has(file)) cache.set(file, loadOne(file))
      return cache.get(file)
    },
    close: () => (tab ? closeTab(cdp, tab.targetId) : undefined),
  }
}

async function openTab(cdp) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const call = (method, params) => cdp.send(method, params, sessionId)
  await call('Runtime.enable')
  return { targetId, call }
}
