// 단계 모듈 불러오기 — 조판 모드 · PDF 검사 · 글쓰기 검사처럼 다른 레인이 채우는 모듈을 필요할 때 불러온다.
// 부르는 곳: build/index.mjs, index.mjs(check · checkWriting), doctor/checks.mjs(내장 글꼴 표).
// 먼저 읽을 파일: docs/contract.md 「파일 소유와 진입 함수」(어느 파일이 무엇을 내보내야 하나).

/** 아직 없는 단계를 부르면 나는 오류. 명령은 종료 코드 2 로 바꾼다. */
export class NotImplementedError extends Error {
  constructor(feature, file) {
    super(`${feature} is not implemented yet (missing ${file})`)
    this.name = 'NotImplementedError'
    this.feature = feature
    this.file = file
  }
}

/** 단계 모듈의 위치(이 파일 기준). 위치를 바꾸면 docs/contract.md 의 표도 함께 고친다. */
export const STAGE_FILES = {
  'mode:spec': './modes/spec.mjs',
  'mode:book': './modes/book.mjs',
  'mode:pages': './modes/pages.mjs',
  check: './check/index.mjs',
  writing: './writing/index.mjs',
  'fonts:builtin': './fonts/builtin.mjs',
}

/**
 * 단계 모듈을 불러온다. 그 파일 자체가 없을 때만 NotImplementedError 로 바꾼다.
 * 그 파일이 가져오는 다른 파일이 없을 때는 원래 오류를 그대로 던진다. 구현 실수를 「아직 없음」으로 가리지 않기 위해서다.
 */
export async function importStage(stage, { baseUrl = import.meta.url, importer = (url) => import(url) } = {}) {
  const relative = STAGE_FILES[stage]
  if (!relative) throw new Error(`Unknown stage: ${stage}`)
  const url = new URL(relative, baseUrl)
  try {
    return await importer(url.href)
  } catch (error) {
    // Node 는 찾지 못한 모듈의 주소를 error.url 에 둔다. 안쪽 가져오기가 실패하면 그 안쪽 파일의 주소가 온다.
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === url.href) throw new NotImplementedError(stage, relative)
    throw error
  }
}
