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

/** 명령 하나의 답을 기다리는 기본 상한(밀리초). 탭이 멈추거나 큰 명령에 답이 오지 않을 때 조판이 멈춰 있지 않게 한다. */
export const COMMAND_TIMEOUT_MS = 300000
/** 탭이 죽었다고 브라우저가 알리는 이벤트. 이 이벤트가 오면 그 탭에 보낸 명령은 답을 받지 못한다. */
const CRASH_EVENTS = ['Inspector.targetCrashed', 'Target.targetCrashed']

/**
 * 죽은 탭에 보낸 명령인가를 가리는 함수. 탭 세션에서 온 알림은 그 세션의 명령만 고른다.
 * 브라우저 쪽 알림(세션 없음)은 어느 탭인지 세션으로 알 수 없어서, 탭에 보낸 명령을 모두 고른다.
 */
const isOnCrashedTab = (message) => (waiter) => (message.sessionId ? waiter.sessionId === message.sessionId : waiter.sessionId !== undefined)

/**
 * 답을 기다리는 명령 묶음. add 로 넣은 명령은 답(settle) · 실패(failWhere) · 시간 상한 가운데 먼저 온 것으로 끝난다.
 * 어느 경우든 한 번만 끝나고, 끝나면 시간 재기를 멈춘다.
 */
function createPending(timeoutMs) {
  const waiters = new Map()
  const finish = (id) => {
    const waiter = waiters.get(id)
    if (!waiter) return null
    clearTimeout(waiter.timer)
    waiters.delete(id)
    return waiter
  }
  return {
    add(id, { method, sessionId, resolve, reject }) {
      const timer = setTimeout(() => finish(id)?.reject(new CdpError(`${method} did not answer within ${Math.round(timeoutMs / 1000)}s`)), timeoutMs)
      waiters.set(id, { sessionId, resolve, reject, timer })
    },
    settle(message) {
      const waiter = finish(message.id)
      if (!waiter) return
      if (message.error) waiter.reject(new CdpError(JSON.stringify(message.error), message.error))
      else waiter.resolve(message.result)
    },
    /** isTarget(waiter) 가 참인 명령을 모두 실패로 끝낸다. */
    failWhere(isTarget, reason) {
      for (const [id, waiter] of [...waiters]) if (isTarget(waiter)) finish(id).reject(new CdpError(reason))
    },
  }
}

/**
 * 웹소켓 주소에 붙어 { send(method, params, sessionId), close() } 를 돌려준다.
 * 연결이 끊기면 답을 기다리던 명령은 모두 실패로 끝나고, 끊긴 뒤에 보낸 명령은 바로 실패한다.
 * 탭이 죽으면 그 탭에 보낸 명령이 실패로 끝난다. 브라우저가 죽거나 멈춰도 조판이 멈춰 있지 않게 하기 위해서다.
 * options.timeoutMs 는 명령 하나의 답을 기다리는 상한이다.
 */
export function connectCdp(webSocketUrl, { timeoutMs = COMMAND_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl)
    const pending = createPending(timeoutMs)
    let lastId = 0
    let isClosed = false
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id) pending.settle(message)
      else if (CRASH_EVENTS.includes(message.method)) pending.failWhere(isOnCrashedTab(message), 'Browser tab crashed')
    }
    socket.onerror = (event) => reject(new CdpError(`CDP connection failed: ${event.message || event.type}`))
    socket.onclose = () => {
      isClosed = true
      pending.failWhere(() => true, 'CDP connection closed')
    }
    socket.onopen = () =>
      resolve({
        send(method, params = {}, sessionId) {
          if (isClosed) return Promise.reject(new CdpError(`CDP connection closed before ${method}`))
          lastId += 1
          const id = lastId
          return new Promise((resolveSend, rejectSend) => {
            pending.add(id, { method, sessionId, resolve: resolveSend, reject: rejectSend })
            socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
          })
        },
        close: () => socket.close(),
      })
  })
}
