// CDP 연결 — 브라우저의 DevTools 웹소켓에 붙어 명령을 보내고 답을 받는다. Node 내장 WebSocket 만 쓴다.
// 부르는 곳: browser/chrome.mjs(withChrome 이 연결을 만든다).
// 먼저 읽을 파일: browser/chrome.mjs.

/** CDP 명령이 실패했거나 연결이 끊겼을 때의 오류. */
export class CdpError extends Error {
  constructor(message, detail) {
    super(message)
    this.name = 'CdpError'
    this.detail = detail
  }
}

/**
 * 웹소켓 주소에 붙어 { send(method, params, sessionId), close() } 를 돌려준다.
 * 연결이 끊기면 답을 기다리던 명령은 모두 실패로 끝난다. 브라우저가 죽어도 조판이 멈춰 있지 않게 하기 위해서다.
 */
export function connectCdp(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl)
    const pending = new Map()
    let lastId = 0
    const failAll = (reason) => {
      for (const waiter of pending.values()) waiter.reject(new CdpError(reason))
      pending.clear()
    }
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      const waiter = message.id ? pending.get(message.id) : undefined
      if (!waiter) return
      pending.delete(message.id)
      if (message.error) waiter.reject(new CdpError(JSON.stringify(message.error), message.error))
      else waiter.resolve(message.result)
    }
    socket.onerror = (event) => reject(new CdpError(`CDP connection failed: ${event.message || event.type}`))
    socket.onclose = () => failAll('CDP connection closed')
    socket.onopen = () =>
      resolve({
        send(method, params = {}, sessionId) {
          lastId += 1
          const id = lastId
          return new Promise((resolveSend, rejectSend) => {
            pending.set(id, { resolve: resolveSend, reject: rejectSend })
            socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
          })
        },
        close: () => socket.close(),
      })
  })
}
