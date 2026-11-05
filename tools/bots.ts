// Outils de développement : clients automatiques qui parlent au serveur par le protocole normal.
// Ils ne choisissent que parmi les actions annoncées comme autorisées dans leur propre vue.
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { nextIntent, seededRandomInt } from '../shared/coinche/testkit'
import type { RoomView } from '../shared/coinche/views'
import type { SessionGrant } from '../shared/protocol'

export type Ack = { ok: boolean; code?: string; message?: string; grant?: SessionGrant; version?: number }

export interface BotOptions {
  url: string
  name: string
  origin?: string
  /** Adresse client simulée (le serveur doit être lancé avec TRUST_PROXY=1) : évite de partager les limites par IP. */
  xff?: string
  transports?: ('websocket' | 'polling')[]
  seed?: number
}

export class Bot {
  view: RoomView | null = null
  grant: SessionGrant | null = null
  socket!: Socket
  latencies: number[] = []
  codes = new Map<string, number>()
  received: string[] = []
  recordMessages = false
  private id = 0
  private rnd: (n: number) => number
  private busy = false
  /** Probabilité de ne pas réagir dans la fenêtre de surcoinche (pour laisser expirer le délai serveur). */
  ignoreWindow = 0
  autoplay = false
  onState: ((v: RoomView) => void) | null = null

  constructor(readonly o: BotOptions) {
    this.rnd = seededRandomInt(o.seed ?? Math.floor(Math.random() * 1e9))
  }

  async connect(): Promise<void> {
    const extraHeaders: Record<string, string> = {}
    if (this.o.origin) extraHeaders.Origin = this.o.origin
    if (this.o.xff) extraHeaders['X-Forwarded-For'] = this.o.xff
    this.socket = io(this.o.url, {
      transports: this.o.transports ?? ['websocket'],
      reconnection: false,
      extraHeaders,
    })
    this.socket.on('state', (v: RoomView) => {
      this.view = v
      if (this.recordMessages) this.received.push(JSON.stringify(v))
      this.onState?.(v)
      if (this.autoplay) void this.step()
    })
    await new Promise<void>((res, rej) => {
      this.socket.once('connect', () => res())
      this.socket.once('connect_error', rej)
    })
  }

  call(event: string, payload: unknown): Promise<Ack> {
    return new Promise((res) => {
      const t0 = performance.now()
      this.socket.emit(event, payload, (a: Ack) => {
        this.latencies.push(performance.now() - t0)
        if (!a.ok) this.codes.set(a.code ?? '?', (this.codes.get(a.code ?? '?') ?? 0) + 1)
        if (this.recordMessages) this.received.push(JSON.stringify(a))
        res(a)
      })
    })
  }

  cmd(type: string, extra: Record<string, unknown> = {}): Promise<Ack> {
    return this.call('command', {
      type,
      commandId: `${this.o.name}-${++this.id}`,
      expectedVersion: this.view?.version,
      ...extra,
    })
  }

  async waitFor(pred: (v: RoomView) => boolean, ms = 5000): Promise<RoomView> {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      if (this.view && pred(this.view)) return this.view
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`${this.o.name} : condition non atteinte (v${this.view?.version})`)
  }

  /** Active le jeu automatique et réagit tout de suite à l'état courant. */
  play(ignoreWindow = 0): void {
    this.ignoreWindow = ignoreWindow
    this.autoplay = true
    void this.step()
  }

  disconnect(): void {
    this.autoplay = false
    this.socket?.disconnect()
  }

  /** Une action autorisée à la fois, avec un petit délai humain. */
  private async step(): Promise<void> {
    if (this.busy || !this.view) return
    const v = this.view
    if (v.round?.phase === 'window' && this.ignoreWindow > 0 && this.rnd(1000) / 1000 < this.ignoreWindow) return
    const intent = nextIntent(v, this.rnd)
    if (!intent) return
    this.busy = true
    try {
      await new Promise((r) => setTimeout(r, this.rnd(25)))
      if (!this.autoplay || this.view?.version !== v.version) return // l'état a changé : on réévalue
      const { type, ...rest } = intent
      const ack = await this.cmd(type, rest)
      // Un refus (état périmé, etc.) : on laisse arriver l'état suivant au lieu de réessayer en boucle.
      if (!ack.ok) await new Promise((r) => setTimeout(r, 150))
    } finally {
      this.busy = false
      if (this.autoplay) setTimeout(() => void this.step(), 5)
    }
  }
}

/** Quatre clients dans un même salon, assis et prêts, partie lancée si `start`. */
export async function openTable(
  url: string,
  tag: string,
  opts: { origin?: string; xff?: string; target?: number; start?: boolean } = {},
): Promise<Bot[]> {
  const names = ['Anne', 'Bob', 'Cléo', 'Dan']
  const bots: Bot[] = []
  for (let i = 0; i < 4; i++) {
    const b = new Bot({ url, name: `${tag}-${names[i]}`, origin: opts.origin, xff: opts.xff })
    await b.connect()
    bots.push(b)
    const ack =
      i === 0
        ? await b.call('room:create', { nickname: names[i] })
        : await b.call('room:join', { code: bots[0].grant!.code, nickname: names[i] })
    if (!ack.ok) throw new Error(`${tag} ${names[i]} : ${ack.code} ${ack.message}`)
    b.grant = ack.grant!
  }
  for (let i = 0; i < 4; i++) await bots[i].waitFor((v) => v.participants.length === 4)
  for (let i = 0; i < 4; i++) {
    const r = await bots[i].cmd('takeSeat', { seat: i })
    if (!r.ok) throw new Error(`${tag} takeSeat : ${r.code}`)
  }
  if (opts.target) await bots[0].cmd('configure', { target: opts.target, firstDealer: 'random' })
  for (const b of bots) await b.cmd('setReady', { ready: true })
  if (opts.start === false) return bots
  await bots[0].waitFor((v) => v.actions.canStart)
  const s = await bots[0].cmd('start')
  if (!s.ok) throw new Error(`${tag} start : ${s.code} ${s.message}`)
  await Promise.all(bots.map((b) => b.waitFor((v) => v.status === 'playing')))
  return bots
}

export const percentile = (xs: number[], p: number): number => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
