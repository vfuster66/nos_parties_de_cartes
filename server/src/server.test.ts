import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { io as connect } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { afterEach, describe, expect, it } from 'vitest'
import { seededRandomInt } from '../../shared/coinche/testkit'
import type { RoomView } from '../../shared/coinche/views'
import type { SessionGrant } from '../../shared/protocol'
import { createApp } from './app'
import { loadConfig } from './config'
import { createLogger } from './logger'

type Ack = { ok: boolean; code?: string; message?: string; grant?: SessionGrant; version?: number }

class Client {
  view: RoomView | null = null
  grant: SessionGrant | null = null
  events: string[] = []
  private nextId = 0
  constructor(
    readonly socket: Socket,
    readonly name: string,
  ) {
    socket.on('state', (v: RoomView) => (this.view = v))
    for (const e of ['replaced', 'kicked', 'left']) socket.on(e, () => this.events.push(e))
  }
  call(event: string, payload: unknown): Promise<Ack> {
    return new Promise((res) => this.socket.emit(event, payload, res))
  }
  /** Envoie une commande visant la version que ce client a vue. */
  cmd(type: string, extra: Record<string, unknown> = {}, over: Record<string, unknown> = {}): Promise<Ack> {
    return this.call('command', { type, commandId: `${this.name}-${++this.nextId}`, expectedVersion: this.view?.version, ...extra, ...over })
  }
  async waitFor(pred: (v: RoomView) => boolean, ms = 3000): Promise<RoomView> {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      if (this.view && pred(this.view)) return this.view
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`${this.name} : condition non atteinte. Vue : ${JSON.stringify(this.view?.pause)} v${this.view?.version}`)
  }
}

const creds = (g: SessionGrant) => ({ roomId: g.roomId, participantId: g.participantId, token: g.token })

let cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const f of cleanup.reverse()) await f()
  cleanup = []
})

async function boot(over: { dbPath?: string; now?: () => number; env?: NodeJS.ProcessEnv } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'coinche-'))
  const dbPath = over.dbPath ?? join(dir, 'db.sqlite')
  const config = loadConfig({ PORT: '0', HOST: '127.0.0.1', DB_PATH: dbPath, ...over.env })
  const app = createApp({ config, logger: createLogger(() => {}, true), now: over.now, randomInt: seededRandomInt(11) })
  const port = await app.listen()
  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    await app.close()
  }
  cleanup.push(close, () => rmSync(dir, { recursive: true, force: true }))
  const open = async (name: string, headers: Record<string, string> = {}) => {
    const socket = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false, extraHeaders: headers })
    await new Promise<void>((res, rej) => {
      socket.once('connect', () => res())
      socket.once('connect_error', rej)
    })
    const c = new Client(socket, name)
    cleanup.push(() => void socket.disconnect())
    return c
  }
  return { app, port, dbPath, open, close }
}

/** Quatre joueurs dans un salon, assis et prêts ; la partie est démarrée si `start`. */
async function table(env: Awaited<ReturnType<typeof boot>>, start = true) {
  const names = ['Anne', 'Bob', 'Cléo', 'Dan']
  const cs: Client[] = []
  const first = await env.open(names[0])
  const created = await first.call('room:create', { nickname: names[0] })
  first.grant = created.grant!
  cs.push(first)
  for (const n of names.slice(1)) {
    const c = await env.open(n)
    const r = await c.call('room:join', { code: first.grant.code, nickname: n })
    expect(r.ok).toBe(true)
    c.grant = r.grant!
    cs.push(c)
  }
  for (let i = 0; i < 4; i++) {
    expect((await cs[i].cmd('takeSeat', { seat: i })).ok).toBe(true)
    expect((await cs[i].cmd('setReady', { ready: true })).ok).toBe(true)
  }
  if (start) {
    expect((await cs[0].cmd('configure', { firstDealer: 3 })).ok).toBe(true)
    for (const c of cs) await c.cmd('setReady', { ready: true })
    for (const c of cs) await c.waitFor((v) => v.participants.every((p) => p.ready))
    const r = await cs[0].cmd('start')
    expect(r.ok).toBe(true)
    for (const c of cs) await c.waitFor((v) => v.status === 'playing')
  }
  return cs
}

describe('serveur : salon, identité et confidentialité', () => {
  it('santé sans données sensibles', async () => {
    const env = await boot()
    const res = await fetch(`http://127.0.0.1:${env.port}/healthz`)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('chaque joueur ne reçoit que sa main, aucune fuite de jeton', async () => {
    const env = await boot()
    const cs = await table(env)
    const tokens = cs.map((c) => c.grant!.token)
    for (const c of cs) {
      const v = await c.waitFor((x) => x.hand.length === 8)
      const json = JSON.stringify(v)
      for (const t of tokens) expect(json).not.toContain(t)
      expect(json).not.toMatch(/token|beloteSeat|"hands"/i)
      const others = cs.filter((o) => o !== c).flatMap((o) => o.view!.hand.map((h) => JSON.stringify(h)))
      for (const h of others) expect(JSON.stringify(v.hand)).not.toContain(h)
      expect(v.round!.cardsLeft).toEqual([8, 8, 8, 8])
    }
    const all = cs.flatMap((c) => c.view!.hand.map((h) => `${h.suit}:${h.rank}`))
    expect(new Set(all).size).toBe(32)
  })

  it('impossible de jouer pour une autre place, ni hors tour', async () => {
    const env = await boot()
    const cs = await table(env)
    const r = await cs[2].cmd('pass') // tour de la place 0
    expect(r).toMatchObject({ ok: false, code: 'not_your_turn' })
    const ok = await cs[0].cmd('pass')
    expect(ok.ok).toBe(true)
  })

  it('reprise avec le jeton ; refusée avec le seul pseudo ou un mauvais jeton ; connexion remplacée', async () => {
    const env = await boot()
    const cs = await table(env)
    const bob = cs[1]
    const g = bob.grant!
    // Avec le pseudo seul : rejoindre échoue (salon commencé), reprendre sans le bon jeton échoue
    const stranger = await env.open('intrus')
    expect((await stranger.call('room:join', { code: g.code, nickname: 'Bob' })).ok).toBe(false)
    expect(await stranger.call('room:resume', { roomId: g.roomId, participantId: g.participantId, token: 'x'.repeat(43) })).toMatchObject({ ok: false, code: 'unauthorized' })
    expect(await stranger.call('room:resume', { roomId: g.roomId, participantId: cs[0].grant!.participantId, token: g.token })).toMatchObject({ ok: false })
    // Avec le bon jeton : la nouvelle connexion remplace l'ancienne
    const again = await env.open('bob2')
    expect((await again.call('room:resume', creds(g))).ok).toBe(true)
    await again.waitFor((v) => v.hand.length === 8)
    await bob.waitFor(() => bob.events.includes('replaced'))
    await new Promise((r) => setTimeout(r, 100))
    expect(bob.socket.connected).toBe(false) // l'ancienne connexion est fermée et ne peut plus agir
    expect(JSON.stringify(again.view!.hand)).toBe(JSON.stringify(bob.view!.hand))
  })

  it('limite les tentatives de recherche de code', async () => {
    const env = await boot()
    const c = await env.open('x')
    let last: Ack = { ok: true }
    for (let i = 0; i < 12; i++) last = await c.call('room:join', { code: 'ZZZZZZZZ', nickname: 'Eve' })
    expect(last).toMatchObject({ ok: false, code: 'rate_limited' })
  })

  it("rejette une origine non autorisée, accepte celle de la configuration", async () => {
    const env = await boot({ env: { ALLOWED_ORIGINS: 'http://ok.example' } })
    await expect(env.open('mauvais', { Origin: 'http://evil.example' })).rejects.toBeTruthy()
    const good = await env.open('bon', { Origin: 'http://ok.example' })
    expect(good.socket.connected).toBe(true)
  })

  it('valide les entrées : pseudo en texte brut, tailles et types', async () => {
    const env = await boot()
    const c = await env.open('a')
    expect(await c.call('room:create', { nickname: '' })).toMatchObject({ ok: false, code: 'invalid' })
    expect(await c.call('room:create', { nickname: 'x'.repeat(50) })).toMatchObject({ ok: false })
    const r = await c.call('room:create', { nickname: '  <b>Zoé</b>‮  ' })
    expect(r.ok).toBe(true)
    const v = await c.waitFor((x) => x.participants.length === 1)
    expect(v.participants[0].nickname).toBe('<b>Zoé</b>') // conservé tel quel, affiché comme texte par le client
    expect(await c.cmd('bid', { value: 'beaucoup', suit: 'coeur' })).toMatchObject({ ok: false, code: 'invalid' })
    expect(await c.call('command', 'nimporte quoi')).toMatchObject({ ok: false })
  })

  it('un doublon de commande (même identifiant) ne s’applique qu’une fois', async () => {
    const env = await boot()
    const cs = await table(env)
    const payload = { type: 'pass', commandId: 'dup-1', expectedVersion: cs[0].view!.version }
    const a = await cs[0].call('command', payload)
    const b = await cs[0].call('command', payload)
    expect(a).toEqual(b)
    const v = await cs[1].waitFor((x) => x.round!.bids.length === 1)
    expect(v.round!.bids).toHaveLength(1)
  })

  it('une commande périmée est refusée clairement', async () => {
    const env = await boot()
    const cs = await table(env)
    const stale = cs[0].view!.version
    await cs[0].cmd('pass')
    const r = await cs[1].call('command', { type: 'pass', commandId: 'late', expectedVersion: stale })
    expect(r).toMatchObject({ ok: false, code: 'stale' })
  })
})

describe('serveur : pause, reprise et redémarrage', () => {
  it('une déconnexion met en pause ; le retour avec le jeton restitue la même main', async () => {
    const env = await boot()
    const cs = await table(env)
    const hand = JSON.stringify(cs[2].view!.hand)
    cs[2].socket.disconnect()
    const v = await cs[0].waitFor((x) => x.pause !== null)
    expect(v.pause!.disconnectedSeats).toEqual([2])
    expect(await cs[0].cmd('pass')).toMatchObject({ ok: false, code: 'paused' })
    expect(v.actions.canPass).toBe(false)
    const back = await env.open('cleo2')
    expect((await back.call('room:resume', creds(cs[2].grant!))).ok).toBe(true)
    const mine = await back.waitFor((x) => x.hand.length === 8 && x.pause === null)
    expect(JSON.stringify(mine.hand)).toBe(hand)
    await cs[0].waitFor((x) => x.pause === null)
    expect((await cs[0].cmd('pass')).ok).toBe(true)
  })

  it('le délai de surcoinche est suspendu pendant la pause puis repris, sans repartir à 10 s', async () => {
    let t = 1_000_000
    const env = await boot({ now: () => t })
    const cs = await table(env)
    await cs[0].cmd('bid', { value: 80, suit: 'coeur' })
    await cs[1].waitFor((v) => v.round!.contract !== null)
    expect((await cs[1].cmd('coinche', { contractRef: cs[1].view!.actions.coinche!.contractRef })).ok).toBe(true)
    const w0 = await cs[0].waitFor((v) => v.round!.phase === 'window')
    expect(w0.round!.window).toMatchObject({ running: true, remainingMs: 10000 })
    t += 4000
    cs[3].socket.disconnect()
    const paused = await cs[0].waitFor((v) => v.pause !== null)
    expect(paused.round!.window).toMatchObject({ running: false, remainingMs: 6000 })
    t += 60_000 // la pause ne consomme pas le délai
    env.app.manager.tickAll()
    expect(cs[0].view!.round!.phase).toBe('window')
    const back = await env.open('dan2')
    await back.call('room:resume', creds(cs[3].grant!))
    const resumed = await cs[0].waitFor((v) => v.pause === null)
    expect(resumed.round!.window).toMatchObject({ running: true, remainingMs: 6000 })
    // Surcoinche après l'échéance : refusée, le contrat reste coinché
    t += 6000
    expect(await cs[0].cmd('surcoinche')).toMatchObject({ ok: false, code: 'window_closed' })
    env.app.manager.tickAll()
    const after = await cs[0].waitFor((v) => v.round!.phase === 'playing')
    expect(after.round!.level).toBe('coinche')
  })

  it('un redémarrage restaure la partie en pause, mains intactes, délai non consommé', async () => {
    let t = 5_000_000
    const dir = mkdtempSync(join(tmpdir(), 'coinche-r-'))
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
    const dbPath = join(dir, 'db.sqlite')
    const env1 = await boot({ dbPath, now: () => t })
    const cs = await table(env1)
    await cs[0].cmd('bid', { value: 90, suit: 'pique' })
    await cs[1].waitFor((v) => v.round!.contract !== null)
    await cs[1].cmd('coinche', { contractRef: cs[1].view!.actions.coinche!.contractRef })
    await cs[0].waitFor((v) => v.round!.phase === 'window')
    const hand = JSON.stringify(cs[3].view!.hand)
    const grant = cs[3].grant!
    t += 3000
    await env1.close() // arrêt propre (comme SIGTERM)
    t += 3_600_000 // une heure d'arrêt
    const env2 = await boot({ dbPath, now: () => t })
    const dan = await env2.open('dan')
    expect((await dan.call('room:resume', creds(grant))).ok).toBe(true)
    const v = await dan.waitFor((x) => x.hand.length === 8)
    expect(JSON.stringify(v.hand)).toBe(hand)
    expect(v.pause).not.toBeNull() // les trois autres ne sont pas revenus
    expect(v.round!.window).toMatchObject({ running: false, remainingMs: 7000 })
    expect(v.round!.contract).toMatchObject({ value: 90, suit: 'pique' })
    expect(await dan.cmd('surcoinche')).toMatchObject({ ok: false })
  })

  it('l’hôte déconnecté est remplacé par un participant connecté', async () => {
    const env = await boot()
    const cs = await table(env, false)
    cs[0].socket.disconnect()
    const v = await cs[1].waitFor((x) => x.participants.find((p) => p.isHost)?.id !== cs[0].grant!.participantId)
    expect(v.participants.find((p) => p.isHost)!.connected).toBe(true)
    expect(v.you.isHost || v.participants.some((p) => p.isHost)).toBe(true)
  })

  it('partie abandonnée par l’hôte : aucun vainqueur', async () => {
    const env = await boot()
    const cs = await table(env)
    expect(await cs[1].cmd('abandon', { confirm: true }, { expectedVersion: undefined })).toMatchObject({ ok: false, code: 'forbidden' })
    expect((await cs[0].cmd('abandon', { confirm: true })).ok).toBe(true)
    const v = await cs[2].waitFor((x) => x.status === 'abandoned')
    expect(v.result!.winnerTeam).toBeNull()
  })
})
