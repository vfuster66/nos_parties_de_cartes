import { randomInt as cryptoRandomInt } from 'node:crypto'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import type { ServerConfig } from './config'
import { isOriginAllowed } from './config'
import type { Logger } from './logger'
import { createLogger } from './logger'
import { RoomManager } from './rooms'
import { Store } from './store'

export interface AppOptions {
  config: ServerConfig
  logger?: Logger
  /** TESTS UNIQUEMENT : horloge injectée. */
  now?: () => number
  /**
   * TESTS UNIQUEMENT : mélange déterministe. Refusé en production pour qu'aucune distribution prévisible
   * ne puisse y être activée, même par erreur.
   */
  randomInt?: (n: number) => number
}

export function createApp(opts: AppOptions) {
  if (opts.randomInt && process.env.NODE_ENV === 'production')
    throw new Error('Un générateur aléatoire injecté est interdit en production.')
  const log = opts.logger ?? createLogger()
  const store = new Store(opts.config.dbPath)
  const now = opts.now ?? Date.now
  const manager = new RoomManager({
    store,
    log,
    now,
    randomInt: opts.randomInt ?? ((n) => cryptoRandomInt(n)),
    trustProxy: opts.config.trustProxy,
  })

  const http = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      let ok: boolean
      try {
        ok = store.ping()
      } catch {
        ok = false
      }
      res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ status: ok ? 'ok' : 'degraded' }))
      return
    }
    res.writeHead(404, { 'cache-control': 'no-store' }).end()
  })

  const io = new Server(http, {
    maxHttpBufferSize: 10_000, // les commandes sont minuscules
    pingInterval: 5000,
    pingTimeout: 5000,
    serveClient: false,
    allowRequest: (req, cb) => cb(null, isOriginAllowed(req.headers.origin, opts.config)),
  })

  io.on('connection', (socket) => {
    log.info('connexion', { socket: socket.id.slice(0, 6) })
    const s = socket as never
    socket.on('room:create', (p: unknown, ack: unknown) => reply(ack, () => manager.create(s, p)))
    socket.on('room:join', (p: unknown, ack: unknown) => reply(ack, () => manager.join(s, p)))
    socket.on('room:resume', (p: unknown, ack: unknown) => reply(ack, () => manager.resume(s, p)))
    socket.on('command', (p: unknown, ack: unknown) => reply(ack, () => manager.command(s, p)))
    socket.on('disconnect', () => {
      try {
        manager.disconnect(s)
      } catch {
        log.error('présence non enregistrée', { socket: socket.id.slice(0, 6) })
      }
      log.info('déconnexion', { socket: socket.id.slice(0, 6) })
    })
  })

  function reply(ack: unknown, fn: () => unknown): void {
    let out: unknown
    try {
      out = fn()
    } catch (e) {
      log.error('erreur de traitement', { message: e instanceof Error ? e.message : 'inconnue' })
      out = { ok: false, code: 'internal', message: 'Erreur interne du serveur.' }
    }
    if (typeof ack === 'function') ack(out)
  }

  const restored = manager.restore(Number(store.getMeta('heartbeat') ?? now()))
  if (restored) log.info('parties restaurées (en pause)', { salons: restored })
  const beat = setInterval(() => store.setMeta('heartbeat', String(now())), 5000)
  const sweep = setInterval(() => manager.purge(), 3_600_000)
  beat.unref()
  sweep.unref()
  store.setMeta('heartbeat', String(now()))
  manager.purge()

  return {
    http,
    io,
    manager,
    store,
    listen: () =>
      new Promise<number>((resolve, reject) => {
        http.once('error', reject)
        http.listen(opts.config.port, opts.config.host, () => {
          const addr = http.address()
          resolve(typeof addr === 'object' && addr ? addr.port : opts.config.port)
        })
      }),
    /** Arrêt propre : parties mises en pause et sauvegardées, connexions fermées, base fermée. */
    async close(): Promise<void> {
      clearInterval(beat)
      clearInterval(sweep)
      manager.shutdown()
      store.setMeta('heartbeat', String(now()))
      await new Promise<void>((r) => io.close(() => r()))
      store.close()
    },
  }
}
