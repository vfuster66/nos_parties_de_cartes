import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { io as connect } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { afterEach, describe, expect, it } from 'vitest'
import { nextIntent, seededRandomInt } from '../../shared/coinche/testkit'
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
  /** Tout ce que ce client a reçu (états, événements, accusés), sérialisé : sert aux contrôles de confidentialité. */
  received: string[] = []
  private nextId = 0
  constructor(
    readonly socket: Socket,
    readonly name: string,
  ) {
    socket.on('state', (v: RoomView) => {
      this.view = v
      this.received.push(JSON.stringify(v))
    })
    for (const e of ['replaced', 'kicked', 'left']) socket.on(e, () => (this.events.push(e), this.received.push(e)))
  }
  call(event: string, payload: unknown): Promise<Ack> {
    return new Promise((res) =>
      this.socket.emit(event, payload, (a: Ack) => {
        this.received.push(JSON.stringify(a))
        res(a)
      }),
    )
  }
  /** Envoie une commande visant la version que ce client a vue. */
  cmd(type: string, extra: Record<string, unknown> = {}, over: Record<string, unknown> = {}): Promise<Ack> {
    return this.call('command', {
      type,
      commandId: `${this.name}-${++this.nextId}`,
      expectedVersion: this.view?.version,
      ...extra,
      ...over,
    })
  }
  async waitFor(pred: (v: RoomView) => boolean, ms = 3000): Promise<RoomView> {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      if (this.view && pred(this.view)) return this.view
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(
      `${this.name} : condition non atteinte. Vue : ${JSON.stringify(this.view?.pause)} v${this.view?.version}`,
    )
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
    const socket = connect(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: headers,
    })
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
    expect(
      await stranger.call('room:resume', { roomId: g.roomId, participantId: g.participantId, token: 'x'.repeat(43) }),
    ).toMatchObject({ ok: false, code: 'unauthorized' })
    expect(
      await stranger.call('room:resume', {
        roomId: g.roomId,
        participantId: cs[0].grant!.participantId,
        token: g.token,
      }),
    ).toMatchObject({ ok: false })
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

  it('rejette une origine non autorisée, accepte celle de la configuration', async () => {
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
    expect(await cs[1].cmd('abandon', { confirm: true }, { expectedVersion: undefined })).toMatchObject({
      ok: false,
      code: 'forbidden',
    })
    expect((await cs[0].cmd('abandon', { confirm: true })).ok).toBe(true)
    const v = await cs[2].waitFor((x) => x.status === 'abandoned')
    expect(v.result!.winnerTeam).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------
// Contrôles de robustesse : confidentialité de bout en bout, déconnexions par phase, redémarrages,
// échec d'écriture, origines. Le joueur automatique n'agit que via les actions annoncées dans sa vue.
// ---------------------------------------------------------------------------------------------

type Env = Awaited<ReturnType<typeof boot>>

/** Joue une commande autorisée à la fois, puis attend que les quatre vues l'aient reçue. */
async function drive(cs: Client[], until: (v: RoomView) => boolean, seed = 5, maxSteps = 4000): Promise<void> {
  const rnd = seededRandomInt(seed)
  for (let step = 0; step < maxSteps; step++) {
    if (until(cs[0].view!)) return
    let progressed = false
    for (const c of cs) {
      const intent = c.view && nextIntent(c.view, rnd)
      if (!intent) continue
      const { type, ...rest } = intent
      const r = await c.cmd(type as string, rest)
      if (r.ok) {
        await Promise.all(cs.map((o) => o.waitFor((v) => v.version >= r.version!)))
        progressed = true
        break
      }
      expect(['stale', 'stale_contract', 'window_closed']).toContain(r.code) // jamais un refus « illégal »
    }
    if (!progressed) await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('drive : état non atteint')
}

/** Cartes (objets {suit, rank}) trouvées n'importe où dans un message. */
function cardsIn(x: unknown, out: string[] = []): string[] {
  if (Array.isArray(x)) x.forEach((e) => cardsIn(e, out))
  else if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>
    const keys = Object.keys(o).sort().join(',')
    if (keys === 'rank,suit') out.push(`${o.rank}${o.suit}`)
    else Object.values(o).forEach((e) => cardsIn(e, out))
  }
  return out
}
const key = (c: { rank: string; suit: string }) => `${c.rank}${c.suit}`

/** Représentation stable d'une vue pour comparer « avant / après » (hors horloge, version, connexions, délai). */
function stable(v: RoomView): string {
  const r = v.round && { ...v.round, window: v.round.window && { acceptedSeats: v.round.window.acceptedSeats } }
  return JSON.stringify({
    status: v.status,
    totals: v.totals,
    rounds: v.rounds,
    round: r,
    hand: v.hand,
    seats: v.seats,
    you: v.you.seat,
    result: v.result,
    nicknames: v.participants.map((p) => [p.id, p.nickname, p.seat]),
  })
}

async function reconnectAll(env: Env, grants: SessionGrant[]): Promise<Client[]> {
  const out: Client[] = []
  for (const g of grants) {
    const c = await env.open(`r-${g.participantId.slice(0, 4)}`)
    expect((await c.call('room:resume', creds(g))).ok).toBe(true)
    c.grant = g
    out.push(c)
  }
  await Promise.all(out.map((c) => c.waitFor((v) => v.pause === null)))
  return out
}

describe('confidentialité observée sur quatre clients indépendants', () => {
  it('états, accusés, erreurs, reconnexion et historique : jamais de main adverse, de jeton ou d’état interne', async () => {
    const env = await boot()
    const cs = await table(env)
    const hashes = (env.app.store.db.prepare('SELECT token_hash FROM tokens').all() as { token_hash: string }[]).map(
      (r) => r.token_hash,
    )
    expect(hashes).toHaveLength(4)

    // Erreurs provoquées volontairement (leurs messages sont aussi inspectés).
    await cs[2].cmd('pass') // hors tour
    await cs[1].cmd('playCard', { card: { suit: 'coeur', rank: 'A' } }) // mauvaise phase
    await cs[3].call('command', { type: 'playCard', card: { suit: 'x', rank: 'y' }, commandId: 'z' })
    const intruder = await env.open('intrus')
    const refused = await intruder.call('room:resume', { ...creds(cs[1].grant!), token: 'y'.repeat(43) })
    intruder.received.push(JSON.stringify(refused))

    // Milieu de donne : 2 cartes déjà jouées.
    await drive(cs, (v) => v.round?.phase === 'playing' && v.round.trick.length === 2)
    const rid = cs[0].grant!.roomId
    const truth = env.app.store.loadRoom(rid)!
    const played = new Set(
      [...truth.round!.tricks.flatMap((t) => t.cards), ...truth.round!.trick].map((t) => key(t.card)),
    )
    cs.forEach((c, seat) => {
      const mine = new Set(truth.round!.hands[seat].map(key))
      const others = truth.round!.hands.flatMap((h, s) => (s === seat ? [] : h.map(key)))
      const seen = new Set(cardsIn(c.view))
      for (const o of others) if (!played.has(o)) expect(seen.has(o)).toBe(false) // aucune main adverse
      for (const m of mine) expect(seen.has(m)).toBe(true)
    })

    // Une reconnexion du joueur 1 pendant la donne.
    const again = await env.open('bob-bis')
    expect((await again.call('room:resume', creds(cs[1].grant!))).ok).toBe(true)
    await again.waitFor((v) => v.hand.length > 0)
    const live = [cs[0], again, cs[2], cs[3]]

    // Jusqu'à la fin de la première donne : résumé, historique.
    await drive(live, (v) => v.round?.phase === 'summary')

    const everything = [...cs, intruder, again]
    const tokensOf = cs.map((c) => c.grant!.token)
    const owner = new Map<Client, string>([
      [cs[0], tokensOf[0]],
      [cs[1], tokensOf[1]],
      [cs[2], tokensOf[2]],
      [cs[3], tokensOf[3]],
      [again, tokensOf[1]],
    ])
    for (const c of everything) {
      for (const msg of c.received) {
        for (const h of hashes) expect(msg).not.toContain(h)
        for (const tk of tokensOf) {
          // Le jeton d'une personne n'apparaît que dans l'accusé de SA création / entrée, jamais ailleurs.
          if (msg.includes(tk)) expect(msg.includes('"grant"') && owner.get(c) === tk).toBe(true)
        }
        expect(msg).not.toMatch(/beloteSeat|"hands"|deck|paquet|stack|at Object|node_modules/i)
        if (!msg.includes('"grant"')) expect(msg).not.toMatch(/token/i)
      }
    }
    // Les états ne placent des cartes que dans : sa main, les plis visibles et ses cartes jouables.
    for (const c of cs) {
      for (const msg of c.received.filter((m) => m.startsWith('{') && m.includes('"serverNow"'))) {
        const v = JSON.parse(msg) as RoomView
        const allowed = new Set(
          [
            ...v.hand,
            ...(v.round?.trick.map((t) => t.card) ?? []),
            ...(v.round?.tricks.flatMap((t) => t.cards.map((x) => x.card)) ?? []),
            ...(v.round?.lastTrick?.cards.map((x) => x.card) ?? []),
          ].map(key),
        )
        for (const found of cardsIn(v)) expect(allowed.has(found)).toBe(true)
        expect(Object.keys(v).sort()).toEqual(
          [
            'version',
            'roomId',
            'code',
            'status',
            'config',
            'you',
            'participants',
            'seats',
            'pause',
            'totals',
            'round',
            'rounds',
            'hand',
            'actions',
            'result',
            'startedAt',
            'endedAt',
            'serverNow',
          ].sort(),
        )
      }
    }
    // Base de données : jetons hachés uniquement, jamais en clair ni dans l'état de la partie.
    const dump = JSON.stringify(env.app.store.db.prepare('SELECT * FROM rooms').all())
    for (const c of cs) expect(dump).not.toContain(c.grant!.token)
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{64}$/)
    // 32 octets aléatoires par jeton, tous différents.
    const toks = cs.map((c) => c.grant!.token)
    expect(new Set(toks).size).toBe(4)
    for (const t of toks) expect(Buffer.from(t, 'base64url')).toHaveLength(32)
  })

  it('le lien d’invitation et le code du salon ne permettent pas de reprendre une place', async () => {
    const env = await boot()
    const cs = await table(env)
    const g = cs[1].grant!
    const stranger = await env.open('intrus')
    // Code + pseudo connus de tous : rien ne permet d'entrer dans une partie commencée ni de prendre la place.
    expect(await stranger.call('room:join', { code: g.code, nickname: 'Bob' })).toMatchObject({ ok: false })
    expect(await stranger.call('room:join', { code: g.code, nickname: 'Nouveau' })).toMatchObject({
      ok: false,
      code: 'wrong_phase',
    })
    // Le jeton n'est jamais dans ce qu'un autre joueur reçoit, donc ne peut pas figurer dans un lien partagé.
    expect(cs[0].received.join('')).not.toContain(g.token)
    expect(g.code).toHaveLength(8)
    // La commande d'un participant ne peut pas viser un autre participant (assignSeat/kick réservés à l'hôte, lobby seulement).
    expect(await cs[1].cmd('kick', { participantId: cs[2].grant!.participantId })).toMatchObject({ ok: false })
  })

  it('une connexion remplacée n’a plus aucun effet : ses commandes sont refusées', async () => {
    const env = await boot()
    const cs = await table(env)
    const old = cs[0]
    // Retient la connexion « ancienne » côté serveur avant son remplacement.
    const again = await env.open('anne-bis')
    await again.call('room:resume', creds(old.grant!))
    await again.waitFor((v) => v.hand.length === 8)
    await old.waitFor(() => old.events.includes('replaced'))
    // Appel direct du gestionnaire avec l'ancien socket : session effacée → refus d'authentification.
    const serverSide = [...env.app.io.sockets.sockets.values()]
    expect(serverSide.some((s) => s.id === old.socket.id)).toBe(false)
    const ack = env.app.manager.command({ data: { session: null }, id: 'fantome' } as never, {
      type: 'pass',
      commandId: 'x',
      expectedVersion: again.view!.version,
    })
    expect(ack).toMatchObject({ ok: false, code: 'unauthorized' })
    expect(again.view!.round!.bids).toHaveLength(0)
  })
})

describe('origines, transport et schémas', () => {
  it('origine inconnue ou « null » refusée, y compris en HTTP long polling ; sans Origin = client non navigateur', async () => {
    const env = await boot({ env: { ALLOWED_ORIGINS: 'https://jeu.example' } })
    for (const o of ['https://evil.example', 'null', 'https://jeu.example.evil.example', 'http://jeu.example']) {
      const res = await fetch(`http://127.0.0.1:${env.port}/socket.io/?EIO=4&transport=polling`, {
        headers: { Origin: o },
      })
      expect(res.status, o).toBe(403)
    }
    const ok = await fetch(`http://127.0.0.1:${env.port}/socket.io/?EIO=4&transport=polling`, {
      headers: { Origin: 'https://jeu.example' },
    })
    expect(ok.status).toBe(200)
    // Aucun en-tête CORS n'est émis : l'origine est contrôlée par le serveur, pas déléguée au navigateur.
    expect(ok.headers.get('access-control-allow-origin')).toBeNull()
    // Même sans Origin, aucune action n'est possible sans identité obtenue par room:create / join / resume.
    const bare = await env.open('script')
    expect(await bare.call('command', { type: 'pass', commandId: 'a', expectedVersion: 1 })).toMatchObject({
      ok: false,
      code: 'unauthorized',
    })
  })

  it('le réseau privé n’est accepté que sur option explicite', async () => {
    const closed = await boot({ env: { ALLOWED_ORIGINS: 'https://jeu.example' } })
    await expect(closed.open('a', { Origin: 'http://192.168.1.20:5173' })).rejects.toBeTruthy()
    const lan = await boot({ env: { ALLOWED_ORIGINS: 'https://jeu.example', ALLOW_PRIVATE_NETWORK_ORIGINS: '1' } })
    expect((await lan.open('b', { Origin: 'http://192.168.1.20:5173' })).socket.connected).toBe(true)
    await expect(lan.open('c', { Origin: 'http://evil.example' })).rejects.toBeTruthy()
  })

  it('messages trop gros, commandes en rafale et champs en trop sont rejetés', async () => {
    const env = await boot()
    const [a] = await table(env, false)
    const burst: Ack[] = []
    for (let i = 0; i < 60; i++) burst.push(await a.cmd('setReady', { ready: true }))
    expect(burst.some((r) => r.code === 'rate_limited')).toBe(true)
    const b = await env.open('b')
    expect(await b.call('room:create', { nickname: 'ok', extra: 1 })).toMatchObject({ ok: false, code: 'invalid' })
    // Message de plus de 10 Ko : la connexion est coupée par le serveur avant tout traitement.
    const closed = new Promise<string>((res) => b.socket.once('disconnect', res))
    b.socket.emit('room:create', { nickname: 'x'.repeat(20_000) })
    expect(await closed).toBeTruthy()
  })
})

describe('déconnexions à chaque phase', () => {
  it('dans le salon : l’hôte n’a plus « Lancer » tant qu’une personne assise est absente', async () => {
    const env = await boot()
    const cs = await table(env, false)
    await cs[0].cmd('configure', {})
    for (const c of cs) await c.cmd('setReady', { ready: true })
    await cs[0].waitFor((v) => v.actions.canStart)
    cs[3].socket.disconnect()
    const v = await cs[0].waitFor((x) => !x.participants[3].connected)
    expect(v.actions.canStart).toBe(false)
    expect(await cs[0].cmd('start')).toMatchObject({ ok: false, code: 'paused' })
  })

  const phases: [string, (v: RoomView) => boolean][] = [
    ['pendant les enchères', (v) => v.round?.phase === 'bidding' && v.round.bids.length === 2],
    ['pendant la fenêtre de surcoinche', (v) => v.round?.phase === 'window'],
    ['au milieu d’un pli', (v) => v.round?.phase === 'playing' && v.round.trick.length === 3],
    ['entre deux donnes', (v) => v.round?.phase === 'summary' && v.status === 'playing'],
  ]
  for (const [label, pred] of phases) {
    it(`${label} : pause cohérente, rien d’accepté, reprise à l’identique, reconnexions répétées sans doublon`, async () => {
      let t = 7_000_000
      const env = await boot({ now: () => t })
      const cs = await table(env)
      // Fabrique les conditions : une enchère coinchée pour atteindre la fenêtre.
      await drive(cs, (v) => (pred(v) ? true : false), 21)
      const before = cs.map((c) => stable(c.view!))
      const turn = cs[0].view!.round!.turn
      const win = cs[0].view!.round!.window
      const ver = cs[0].view!.version
      const leaver = cs[2]
      leaver.socket.disconnect()
      const paused = await cs[0].waitFor((v) => v.pause !== null)
      t += 25_000 // le temps passe pendant la pause
      expect(paused.pause!.disconnectedSeats).toEqual([2])
      expect(paused.round!.turn).toBe(turn) // le joueur actif ne change pas
      if (win) expect(paused.round!.window).toMatchObject({ running: false, remainingMs: expect.any(Number) })
      if (win) expect(paused.round!.window!.remainingMs).toBeLessThanOrEqual(win.remainingMs)
      env.app.manager.tickAll()
      expect(cs[0].view!.round!.phase).toBe(pred === phases[1][1] ? 'window' : cs[0].view!.round!.phase)
      // Aucune action de jeu acceptée pendant la pause, quelle que soit la phase.
      for (const c of [cs[0], cs[1], cs[3]]) {
        const intent = { pass: {}, nextRound: {}, playCard: { card: c.view!.hand[0] ?? { suit: 'coeur', rank: 'A' } } }
        for (const [type, extra] of Object.entries(intent))
          expect(await c.cmd(type, extra)).toMatchObject({ ok: false, code: 'paused' })
        expect(c.view!.actions.canPass || c.view!.actions.playable.length || c.view!.actions.canReadyNext).toBeFalsy()
      }
      expect(cs[0].view!.version).toBeGreaterThanOrEqual(ver)
      // Reconnexions répétées (3 fois de suite, anciennes connexions remplacées) : un seul état, pas de doublon.
      let back: Client | null = null
      for (let i = 0; i < 3; i++) {
        back = await env.open(`retour-${i}`)
        expect((await back.call('room:resume', creds(leaver.grant!))).ok).toBe(true)
      }
      await back!.waitFor((v) => v.pause === null && v.version > 0)
      await cs[0].waitFor((v) => v.pause === null)
      const after = [cs[0], cs[1], back!, cs[3]].map((c) => stable(c.view!))
      expect(after).toEqual(before)
      if (win) {
        const resumed = cs[0].view!.round!.window!
        expect(resumed.running).toBe(true)
        expect(resumed.remainingMs).toBeLessThanOrEqual(win.remainingMs)
        expect(resumed.remainingMs).toBeGreaterThan(0)
      }
    })
  }

  it('sur l’écran du résultat final : la partie reste consultable et ne se met pas en pause', async () => {
    const env = await boot()
    const cs = await table(env, false)
    await cs[0].cmd('configure', { target: 100 })
    for (const c of cs) await c.cmd('setReady', { ready: true })
    await cs[0].waitFor((v) => v.actions.canStart)
    expect((await cs[0].cmd('start')).ok).toBe(true)
    await drive(cs, (v) => v.status === 'finished', 9)
    const result = JSON.stringify(cs[0].view!.result)
    cs[1].socket.disconnect()
    await cs[0].waitFor((v) => !v.participants[1].connected)
    expect(cs[0].view!.pause).toBeNull()
    expect(JSON.stringify(cs[0].view!.result)).toBe(result)
    expect(await cs[0].cmd('nextRound')).toMatchObject({ ok: false, code: 'wrong_phase' })
  })
})

describe('redémarrage du serveur à plusieurs phases', () => {
  const stops: [string, (v: RoomView) => boolean, number][] = [
    ['salon complet, avant le lancement', (v) => v.status === 'lobby', 0],
    ['enchères', (v) => v.round?.phase === 'bidding' && v.round.bids.length === 1, 1],
    ['fenêtre de surcoinche', (v) => v.round?.phase === 'window', 2],
    ['milieu d’un pli', (v) => v.round?.phase === 'playing' && v.round.trick.length === 2, 3],
    ['résumé de donne', (v) => v.round?.phase === 'summary' && v.status === 'playing', 4],
  ]
  for (const [label, pred, i] of stops) {
    it(`${label} : mains, phase, scores et historique identiques, aucune redistribution ni score doublé`, async () => {
      let t = 9_000_000
      const dir = mkdtempSync(join(tmpdir(), 'coinche-s-'))
      cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
      const dbPath = join(dir, 'db.sqlite')
      const env1 = await boot({ dbPath, now: () => t })
      const cs = await table(env1, i > 0)
      if (i === 0) for (const c of cs) await c.cmd('setReady', { ready: true })
      await drive(cs, pred, 31 + i)
      const before = cs.map((c) => stable(c.view!))
      const grants = cs.map((c) => c.grant!)
      const rounds = cs[0].view!.rounds.length
      const totals = cs[0].view!.totals
      await env1.close()
      t += 7_200_000
      const env2 = await boot({ dbPath, now: () => t })
      const back = await reconnectAll(env2, grants)
      expect(back.map((c) => stable(c.view!))).toEqual(before)
      expect(back[0].view!.rounds).toHaveLength(rounds)
      expect(back[0].view!.totals).toEqual(totals)
      // La partie reprend normalement et chaque donne n'est comptée qu'une fois.
      if (i > 0) {
        await drive(back, (v) => v.rounds.length >= rounds + 1 || v.status === 'finished', 77)
        const sum = back[0].view!.rounds.reduce((a, r) => [a[0] + r.delta[0], a[1] + r.delta[1]], [0, 0])
        expect(back[0].view!.totals).toEqual(sum)
      }
    })
  }

  it('résultat final après redémarrage : consultable, scores et historique identiques', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'coinche-f-'))
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
    const dbPath = join(dir, 'db.sqlite')
    const env1 = await boot({ dbPath })
    const cs = await table(env1, false)
    await cs[0].cmd('configure', { target: 100 })
    for (const c of cs) await c.cmd('setReady', { ready: true })
    await cs[0].waitFor((v) => v.actions.canStart)
    await cs[0].cmd('start')
    await drive(cs, (v) => v.status === 'finished', 3)
    const before = stable(cs[2].view!)
    const grant = cs[2].grant!
    await env1.close()
    const env2 = await boot({ dbPath })
    const one = await env2.open('seul')
    expect((await one.call('room:resume', creds(grant))).ok).toBe(true)
    await one.waitFor((v) => v.status === 'finished')
    expect(stable(one.view!)).toBe(before)
  })
})

describe('cohérence écriture SQLite / accusé / diffusion', () => {
  it('une écriture qui échoue ne renvoie pas de succès, ne diffuse rien et laisse l’état intact', async () => {
    const env = await boot()
    const cs = await table(env)
    const v0 = cs[0].view!.version
    const states = (c: Client) => c.received.filter((m) => m.includes('"serverNow"')).length
    const msgs = cs.map(states)
    const original = env.app.store.saveRoom.bind(env.app.store)
    let failures = 1
    env.app.store.saveRoom = (...a: Parameters<typeof original>) => {
      if (failures-- > 0) throw new Error('disque plein (simulé)')
      return original(...a)
    }
    const r = await cs[0].cmd('pass')
    expect(r).toMatchObject({ ok: false, code: 'internal' })
    expect(r.message).not.toMatch(/disque|SQLITE|plein/i) // pas de détail interne
    await new Promise((x) => setTimeout(x, 80))
    expect(cs.map(states)).toEqual(msgs) // aucune diffusion d'un état non durable
    expect(env.app.manager['rooms'].get(cs[0].grant!.roomId)!.state.version).toBe(v0)
    // Même identifiant de commande : le refus n'a pas été mémorisé comme un succès, la reprise fonctionne.
    const retry = await cs[0].call('command', { type: 'pass', commandId: 'retry', expectedVersion: v0 })
    expect(retry.ok).toBe(true)
    await cs[1].waitFor((v) => v.round!.bids.length === 1)
    const stored = env.app.store.loadRoom(cs[0].grant!.roomId)!
    expect(stored.round!.bids).toHaveLength(1)
  })

  it('une entrée dans le salon qui échoue à l’écriture ne crée pas de participant fantôme', async () => {
    const env = await boot()
    const host = await env.open('h')
    const created = await host.call('room:create', { nickname: 'Hôte' })
    const original = env.app.store.saveRoom.bind(env.app.store)
    env.app.store.saveRoom = () => {
      throw new Error('simulé')
    }
    const guest = await env.open('g')
    const r = await guest.call('room:join', { code: created.grant!.code, nickname: 'Invité' })
    expect(r).toMatchObject({ ok: false, code: 'internal' })
    env.app.store.saveRoom = original
    expect(env.app.manager['rooms'].get(created.grant!.roomId)!.state.participants).toHaveLength(1)
    expect((await guest.call('room:join', { code: created.grant!.code, nickname: 'Invité' })).ok).toBe(true)
  })

  it('une commande répétée après reconnexion ne compte pas une donne deux fois', async () => {
    const env = await boot()
    const cs = await table(env)
    await drive(cs, (v) => v.round?.phase === 'playing' && v.round.tricks.length === 7 && v.round.trick.length === 3, 4)
    const last = cs.find((c) => c.view!.actions.playable.length > 0)!
    const card = last.view!.actions.playable[0]
    const payload = { type: 'playCard', card, commandId: 'dernier-pli', expectedVersion: last.view!.version }
    const first = await last.call('command', payload)
    expect(first.ok).toBe(true)
    await last.waitFor((v) => v.round!.phase === 'summary' || v.status === 'finished')
    const totals = JSON.stringify(last.view!.totals)
    const rounds = last.view!.rounds.length
    // Reconnexion puis renvoi de la même commande (réseau instable) et d'une copie « périmée ».
    last.socket.disconnect()
    const back = await env.open('retour')
    await back.call('room:resume', creds(last.grant!))
    await back.waitFor((v) => v.hand.length === 0)
    const replay = await back.call('command', payload)
    expect(replay).toEqual(first) // même accusé que la première fois, sans second effet
    expect(back.view!.rounds).toHaveLength(rounds)
    expect(JSON.stringify(back.view!.totals)).toBe(totals)
    const again = await back.call('command', { ...payload, commandId: 'autre-id' })
    expect(again).toMatchObject({ ok: false })
    expect(JSON.stringify(back.view!.totals)).toBe(totals)
  })
})

describe('mémoire : salons terminés', () => {
  it('une partie terminée que plus personne ne consulte quitte la mémoire, et se recharge à la demande', async () => {
    const env = await boot()
    const cs = await table(env, false)
    await cs[0].cmd('configure', { target: 100 })
    for (const c of cs) await c.cmd('setReady', { ready: true })
    await cs[0].waitFor((v) => v.actions.canStart)
    await cs[0].cmd('start')
    await drive(cs, (v) => v.status === 'finished', 8)
    const total = JSON.stringify(cs[0].view!.totals)
    expect(env.app.manager.roomCount).toBe(1)
    for (const c of cs) c.socket.disconnect()
    for (let i = 0; i < 100 && env.app.manager.roomCount > 0; i++) await new Promise((r) => setTimeout(r, 10))
    expect(env.app.manager.roomCount).toBe(0)
    const back = await env.open('retour')
    expect((await back.call('room:resume', creds(cs[1].grant!))).ok).toBe(true)
    await back.waitFor((v) => v.status === 'finished')
    expect(JSON.stringify(back.view!.totals)).toBe(total)
  })
})
