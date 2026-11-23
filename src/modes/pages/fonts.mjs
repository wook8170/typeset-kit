// 글꼴 준비 — 설정의 글꼴을 CSS 로 바꾼다. 글꼴 모듈(fonts/css.mjs · fonts/builtin.mjs)이 아직 없는 설치에서는 빈 값을 돌려준다.
// 부르는 곳: modes/pages.mjs.
// 먼저 읽을 파일: docs/contract.md 「내장 글꼴 표」, src/fonts/css.mjs.

/** 이 파일 기준 상대 경로의 모듈을 불러온다. 그 모듈 자체가 없을 때만 null 이고, 안쪽 오류는 그대로 던진다. */
async function importOptional(relative) {
  const url = new URL(relative, import.meta.url)
  try {
    return await import(url.href)
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === url.href) return null
    throw error
  }
}

async function familyOf(spec) {
  if (spec && typeof spec === 'object') return spec.family
  const builtinName = typeof spec === 'string' && spec.startsWith('builtin:') ? spec.slice('builtin:'.length) : null
  if (!builtinName) return null
  const builtin = await importOptional('../../fonts/builtin.mjs')
  return builtin?.BUILTIN_FONTS?.[builtinName]?.family ?? null
}

/** 돌려주는 값 = { css, family }. css 는 @font-face 묶음, family 는 본문 글꼴 이름(없으면 sans-serif)이다. */
export async function loadFonts(settings, root) {
  const specs = settings.theme?.fonts
  if (!specs) return { css: '', family: 'sans-serif' }
  const fontModule = await importOptional('../../fonts/css.mjs')
  const css = fontModule ? await fontModule.fontCss(specs, { root }) : ''
  const family = await familyOf(specs.sans)
  return { css, family: family ? `'${family}', sans-serif` : 'sans-serif' }
}
