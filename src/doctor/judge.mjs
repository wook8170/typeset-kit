// doctor 판정 — 점검 항목마다 읽어 온 사실을 받아 ok · warn · fail 을 정한다. 모두 순수 함수다.
// 부르는 곳: doctor/run.mjs(사실을 모아 이 함수들에 넘긴다), 테스트.
// 먼저 읽을 파일: doctor/run.mjs.

export const MIN_NODE_MAJOR = 22

const result = (id, status, detail) => ({ id, status, detail })

/** Node 버전. 내장 WebSocket · fetch · node:test 를 쓰므로 22 이상이어야 한다. */
export function judgeNode(version) {
  const major = Number(String(version).replace(/^v/, '').split('.')[0])
  if (major >= MIN_NODE_MAJOR) return result('node', 'ok', `v${String(version).replace(/^v/, '')}`)
  return result('node', 'fail', `v${String(version).replace(/^v/, '')} < ${MIN_NODE_MAJOR}`)
}

/** 설정 파일. 없으면 경고다(doctor 는 설정 없이도 돈다). 문제가 있으면 문제를 모두 적는다. */
export function judgeConfig({ file, problems, isMissing }) {
  if (isMissing) return result('config', 'warn', 'typeset.config.mjs not found (run `typeset-kit init`)')
  if (problems.length > 0) {
    const lines = problems.map((problem) => `${problem.code} ${problem.path ?? ''}${problem.expected ? ` (expected ${problem.expected})` : ''}`)
    return result('config', 'fail', `${file}\n${lines.join('\n')}`)
  }
  return result('config', 'ok', file)
}

/** 브라우저 위치. 찾지 못하면 설치 안내를 함께 적는다. */
export function judgeBrowserLocation({ browserPath, error }) {
  if (browserPath) return result('browser', 'ok', browserPath)
  return result('browser', 'fail', error.message)
}

/**
 * 책갈피 지원. 버전 번호로 짐작하지 않고 작은 문서를 실제로 구워 책갈피(/Outlines)가 생기는지 본다.
 * 책갈피 없는 PDF 를 조용히 만들지 않기 위해, 생기지 않으면 실패다.
 */
export function judgeOutline({ product, hasOutline, error }) {
  if (error) return result('outline', 'fail', `browser launch failed: ${error.message}`)
  if (hasOutline) return result('outline', 'ok', `${product}: bookmarks supported`)
  return result('outline', 'fail', `${product}: printToPDF did not write bookmarks. Update the browser.`)
}

/** 설정에서 쓰는 글꼴 지정을 모은다. 전역 theme.fonts 와 문서별 덮어쓰기에서 모두 뽑는다. 같은 지정은 한 번만 둔다. */
export function collectFontSpecs(config) {
  const themes = [config.theme, ...config.documents.map((document) => document.theme).filter(Boolean)]
  const specs = themes.flatMap((theme) => Object.values(theme.fonts ?? {}))
  const seen = new Set()
  return specs.filter((spec) => {
    const key = JSON.stringify(spec)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * 글꼴 파일이 모두 있는가. builtinFonts 는 내장 글꼴 표(없으면 null — 아직 패키지에 글꼴이 들어오지 않았다).
 * resolveFile(spec 안의 상대 경로) → 절대 경로, fileExists(경로) → 있는가.
 */
export function judgeFonts(specs, { builtinFonts, builtinPath, resolveFile, fileExists }) {
  const missing = []
  for (const spec of specs) {
    if (typeof spec === 'string') {
      const name = spec.slice('builtin:'.length)
      const entry = builtinFonts?.[name]
      if (!entry) missing.push(`${spec} (not bundled)`)
      else missing.push(...entry.files.map((file) => builtinPath(file.path)).filter((path) => !fileExists(path)))
      continue
    }
    missing.push(...spec.files.map((file) => resolveFile(file.path)).filter((path) => !fileExists(path)))
  }
  if (missing.length > 0) return result('fonts', 'fail', `missing font files:\n${missing.join('\n')}`)
  return result('fonts', 'ok', `${specs.length} font setting(s) checked`)
}

/** 종료 코드. fail 이 하나라도 있으면 굽지 못할 상태라 1 이다. */
export const doctorExitCode = (results) => (results.some((item) => item.status === 'fail') ? 1 : 0)
