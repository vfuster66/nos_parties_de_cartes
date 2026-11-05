// Journal en lignes JSON. Jamais de jeton ni de main : les champs sensibles sont masqués par construction.
const FORBIDDEN = /token|hand|card|secret|password/i

export type Fields = Record<string, string | number | boolean | null | undefined>

export interface Logger {
  info(msg: string, f?: Fields): void
  warn(msg: string, f?: Fields): void
  error(msg: string, f?: Fields): void
}

export function createLogger(
  write: (line: string) => void = (l) => process.stdout.write(l + '\n'),
  silent = false,
): Logger {
  const emit = (level: string, msg: string, f: Fields = {}): void => {
    if (silent) return
    const safe: Fields = {}
    for (const [k, v] of Object.entries(f)) safe[k] = FORBIDDEN.test(k) ? '[masqué]' : v
    write(JSON.stringify({ t: new Date().toISOString(), level, msg, ...safe }))
  }
  return {
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
  }
}
