// 웹판 HTML — 책 명세를 쪽을 나누지 않는 읽기용 HTML 한 파일로 만든다. 옆 차례, 밝은 · 어두운 테마, 스크립트 없음.
// 부르는 곳: modes/spec.mjs(출력에 web 이 있을 때 renderWebHtml), 그래서 book 모드도 같은 길을 탄다.
// 먼저 읽을 파일: web/styles.mjs(웹판 CSS), render/index.mjs 의 renderBody(본문 블록은 인쇄판과 같은 함수).
//
// 글꼴과 그림은 문서 안에 들어 있어 바깥 요청이 없다. 내용 보안 정책이 스크립트와 바깥 자원을 모두 막는다.

import { assignAnchors } from '../spec/contract.mjs'
import { deriveIssue, localeWords, renderBody } from '../render/index.mjs'
import { defineTheme } from '../theme/index.mjs'
import { webCss } from './styles.mjs'

const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 스크립트가 없는 문서의 정책. 그림 · 글꼴은 data 주소만, 스타일은 문서 안 것만 허용한다. */
export const WEB_CSP = ["default-src 'none'", "style-src 'unsafe-inline'", 'img-src data:', 'font-src data:', "base-uri 'none'", "form-action 'none'"].join('; ')

/** 차례 목록(순수 함수). 장 → 절 두 단계이고, 줄마다 본문 앵커로 가는 링크다. 명세에는 앵커가 붙어 있어야 한다. */
export function webTocHtml(spec) {
  const chapters = spec.chapters.map((chapter) => {
    const sections = chapter.sections
      .map((section) => `<li><a href="#${escapeHtml(section.anchor)}"><span class="wtocno">${escapeHtml(section.no)}</span>${escapeHtml(section.title)}</a></li>`)
      .join('')
    const number = escapeHtml(chapter.label || chapter.no)
    return `<li><a href="#${escapeHtml(chapter.anchor)}"><span class="wtocno">${number}</span>${escapeHtml(chapter.title)}</a>${sections ? `<ul>${sections}</ul>` : ''}</li>`
  })
  return `<ul class="wtoc">${chapters.join('')}</ul>`
}

function headerHtml(spec, settings) {
  const issue = deriveIssue(spec.docInfo?.revisions)
  return (
    `<header class="whead">` +
    (settings.brand.name ? `<div class="wbrand">${escapeHtml(settings.brand.name)}</div>` : '') +
    `<h1 class="wtitle">${escapeHtml(spec.title)}</h1>` +
    (spec.subtitle ? `<div class="wsub">${escapeHtml(spec.subtitle)}</div>` : '') +
    (spec.lede ? `<p class="wlede">${spec.lede}</p>` : '') +
    (issue.edition ? `<div class="wedition">${escapeHtml(issue.edition)}</div>` : '') +
    `</header>`
  )
}

function footerHtml(settings) {
  const { publisher, contact } = settings.brand
  const parts = [publisher, contact].filter(Boolean).map(escapeHtml)
  return parts.length ? `<footer class="wfoot">${parts.join(' · ')}</footer>` : ''
}

/**
 * 웹판 HTML 한 벌(문자열). options = { settings, fontCss, theme, words }.
 * settings 는 documentSettings() 의 결과, theme 은 defineTheme() 의 결과(없으면 명세 hue → 설정 hue 로 만든다).
 */
export function renderWebHtml(sourceSpec, { settings, fontCss = '', theme, words } = {}) {
  if (!settings) throw new Error('renderWebHtml options.settings is required (use documentSettings())')
  const spec = assignAnchors(sourceSpec)
  const documentWords = localeWords(settings.locale, words)
  const webTheme = theme ?? defineTheme({ hue: spec.hue ?? settings.theme.hue, callouts: settings.theme.callouts })
  const toc = webTocHtml(spec)
  const title = [settings.brand.name, spec.title].filter(Boolean).map(escapeHtml).join(' ')
  const tocLabel = escapeHtml(documentWords.tocTitle)
  return `<!doctype html>
<html lang="${documentWords.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${WEB_CSP}"><title>${title}</title>
<style>${fontCss}</style>
<style>${webCss(webTheme, documentWords)}</style>
</head><body><div class="wlayout">
<nav class="wside" aria-label="${tocLabel}"><div class="wtoctitle">${tocLabel}</div>${toc}</nav>
<main class="wmain">${headerHtml(spec, settings)}
<details class="wtocmini"><summary>${tocLabel}</summary>${toc}</details>
<article>${renderBody(spec, { settings, theme: webTheme, words })}</article>
${footerHtml(settings)}</main>
</div></body></html>`
}
