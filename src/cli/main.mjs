// 명령줄 진입 — 인자에서 명령을 골라 그 명령의 run 을 부르고, 알려진 오류를 문구와 종료 코드로 바꾼다.
// 부르는 곳: bin/typeset-kit.mjs.
// 먼저 읽을 파일: cli/commands/*(명령마다 하나), cli/exit.mjs(종료 코드), cli/messages.mjs(문구).
import { parseArgs } from 'node:util'
import { BrowserNotFoundError } from '../browser/find.mjs'
import { UnknownDocumentError } from '../config/document.mjs'
import { ConfigError } from '../config/load.mjs'
import { NotImplementedError } from '../stages.mjs'
import * as buildCommand from './commands/build.mjs'
import * as checkCommand from './commands/check.mjs'
import * as checkWritingCommand from './commands/check-writing.mjs'
import * as doctorCommand from './commands/doctor.mjs'
import * as initCommand from './commands/init.mjs'
import { EXIT } from './exit.mjs'
import { messagesFor, pickLanguage } from './messages.mjs'

export const COMMANDS = {
  build: buildCommand,
  check: checkCommand,
  'check-writing': checkWritingCommand,
  doctor: doctorCommand,
  init: initCommand,
}

/** 입력(원고 · 책 명세 · 검사 대상)이 틀려서 나는 오류의 이름. 단계 모듈을 미리 불러오지 않으려고 이름으로 견준다. */
const INPUT_ERROR_NAMES = new Set(['SpecError', 'MarkdownError', 'WritingCheckError'])

const COMMON_OPTIONS = { config: { type: 'string' }, help: { type: 'boolean', short: 'h' } }

function formatConfigError(error, messages) {
  const lines = error.problems.map(
    (problem) =>
      `  ${problem.code} ${problem.path ?? ''}${problem.expected ? ` (expected ${problem.expected})` : ''}${problem.got ? ` got ${problem.got}` : ''}`,
  )
  return [messages.configProblems(error.file), ...lines].join('\n')
}

/** 알려진 오류 → { code, text }(순수 함수). 모르는 오류는 null 이고, 호출 쪽이 실패(1)로 알린다. */
export function describeError(error, messages) {
  if (error instanceof ConfigError) return { code: EXIT.usage, text: formatConfigError(error, messages) }
  if (error instanceof NotImplementedError) return { code: EXIT.usage, text: messages.notImplemented(error.feature) }
  if (error instanceof UnknownDocumentError) return { code: EXIT.usage, text: error.message }
  if (error instanceof BrowserNotFoundError) return { code: EXIT.failed, text: error.message }
  // 원고 · 명세 · 검사 대상의 문제는 사용자가 고칠 것이다. 스택 없이 문구만 보인다.
  if (INPUT_ERROR_NAMES.has(error?.name)) return { code: EXIT.failed, text: error.message }
  if (error?.code?.startsWith?.('ERR_PARSE_ARGS')) return { code: EXIT.usage, text: messages.badArguments(error.message) }
  return null
}

/**
 * 명령줄을 실행하고 종료 코드를 돌려준다. io = { out(text), err(text), cwd, env }.
 * 프로세스를 끝내지 않는다. 그래서 테스트가 같은 프로세스에서 부를 수 있다.
 */
export async function runCli(argv, io) {
  const messages = messagesFor(pickLanguage(io.env))
  const [name, ...rest] = argv
  if (!name || name === '--help' || name === '-h' || name === 'help') {
    io.out(messages.usage)
    return name ? EXIT.ok : EXIT.usage
  }
  const command = COMMANDS[name]
  if (!command) {
    io.err(`${messages.unknownCommand(name)}\n\n${messages.usage}`)
    return EXIT.usage
  }
  try {
    const parsed = parseArgs({ args: rest, options: { ...COMMON_OPTIONS, ...command.options }, allowPositionals: true, strict: true })
    if (parsed.values.help) {
      io.out(messages.usage)
      return EXIT.ok
    }
    return await command.run(parsed, { ...io, messages })
  } catch (error) {
    const known = describeError(error, messages)
    if (known) {
      io.err(known.text)
      return known.code
    }
    io.err(messages.failed(error.stack ?? error.message))
    return EXIT.failed
  }
}
