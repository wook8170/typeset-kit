// PDF 후처리 테스트 — 책갈피 · 링크 · 쪽 번호 표기 · 객체 스트림 저장.
// 부르는 곳: npm test.
// 먼저 읽을 파일: test/pdf/nav-cases.mjs(사례), src/pdf/nav.mjs.
import { test } from 'node:test'
import { applyPdfNavBytes } from '../../src/pdf/nav.mjs'
import { navCases } from './nav-cases.mjs'

for (const [title, run] of Object.entries(navCases)) test(title, () => run({ applyPdfNavBytes }))
