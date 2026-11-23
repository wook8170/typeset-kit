// 명령줄 문구 — 명령이 사용자에게 보이는 문구를 한국어 · 영어 두 벌로 둔다. 문서 안의 낱말 묶음(렌더용)과는 따로다.
// 부르는 곳: cli/main.mjs, cli/commands/*.
// 먼저 읽을 파일: 없음.

const MESSAGES = {
  ko: {
    usage: [
      '사용법: typeset-kit <명령> [옵션]',
      '',
      '명령',
      '  build [문서 id…]   설정의 문서를 굽는다 (--pdf · --web · --html-only · --allow-overflow)',
      '  check <pdf…>       PDF 의 차례 · 책갈피 · 링크 · 쪽 번호 표기를 검사한다',
      '  check-writing      글쓰기 규칙을 검사한다 (--check · --update-baseline)',
      '  doctor             굽기 환경(Node · 브라우저 · 책갈피 · 글꼴 · 설정)을 점검한다',
      '  init               설정 파일 견본을 만든다 (--force 로 덮어쓴다)',
      '',
      '공통 옵션: --config <파일>',
    ].join('\n'),
    unknownCommand: (name) => `알 수 없는 명령: ${name}`,
    badArguments: (detail) => `인자 오류: ${detail}`,
    configProblems: (file) => `설정 오류: ${file ?? '(설정 파일 없음)'}`,
    notImplemented: (feature) => `아직 구현되지 않은 단계입니다: ${feature}`,
    failed: (message) => `실패: ${message}`,
    doctorLabels: { node: 'Node', config: '설정', browser: '브라우저', outline: '책갈피', fonts: '글꼴' },
    built: (count, outDir) => `완료: 문서 ${count}개 → ${outDir}`,
    documentProblems: (id, count) => `${id}: 문제 ${count}건`,
    initCreated: (file) => `만들었습니다: ${file}`,
    initExists: (file) => `이미 있습니다: ${file} (덮어쓰려면 --force)`,
    checkNeedsFiles: '검사할 PDF 파일을 하나 이상 주십시오.',
    writingMode: '--check 와 --update-baseline 은 함께 쓸 수 없습니다.',
  },
  en: {
    usage: [
      'Usage: typeset-kit <command> [options]',
      '',
      'Commands',
      '  build [document id…]  build documents from the config (--pdf, --web, --html-only, --allow-overflow)',
      '  check <pdf…>          check table of contents, bookmarks, links and page labels in PDFs',
      '  check-writing         check writing rules (--check, --update-baseline)',
      '  doctor                check the build environment (Node, browser, bookmarks, fonts, config)',
      '  init                  write a sample config file (--force overwrites)',
      '',
      'Common option: --config <file>',
    ].join('\n'),
    unknownCommand: (name) => `Unknown command: ${name}`,
    badArguments: (detail) => `Invalid arguments: ${detail}`,
    configProblems: (file) => `Config error: ${file ?? '(no config file)'}`,
    notImplemented: (feature) => `This stage is not implemented yet: ${feature}`,
    failed: (message) => `Failed: ${message}`,
    doctorLabels: { node: 'Node', config: 'Config', browser: 'Browser', outline: 'Bookmarks', fonts: 'Fonts' },
    built: (count, outDir) => `Done: ${count} document(s) -> ${outDir}`,
    documentProblems: (id, count) => `${id}: ${count} problem(s)`,
    initCreated: (file) => `Created: ${file}`,
    initExists: (file) => `Already exists: ${file} (use --force to overwrite)`,
    checkNeedsFiles: 'Give at least one PDF file to check.',
    writingMode: '--check and --update-baseline cannot be used together.',
  },
}

/** 문구 언어를 고른다(순수 함수). TYPESET_KIT_LANG 이 먼저이고, 없으면 LANG · LC_ALL 이 ko 로 시작할 때 한국어다. */
export function pickLanguage(env) {
  const declared = env.TYPESET_KIT_LANG ?? env.LC_ALL ?? env.LANG ?? ''
  return declared.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

export const messagesFor = (language) => MESSAGES[language] ?? MESSAGES.en
