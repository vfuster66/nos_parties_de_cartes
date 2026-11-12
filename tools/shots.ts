// Captures d'écran reproductibles de tous les écrans principaux (compteur et jeu en ligne).
// Usage : npx tsx tools/shots.ts <dossier> [largeur] [navigateur] [filtre]
// Prérequis : serveur de test (npx tsx e2e/server.ts) et client Vite sur 127.0.0.1:5199 (voir playwright.config.ts).
// Données entièrement fictives. Les joueurs « autres » sont des clients automatiques qui n'utilisent que les actions
// annoncées comme autorisées ; le joueur affiché est un vrai navigateur dont l'état passe par le store du client.
import { chromium, webkit } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { SUITS } from '../shared/coinche/cards'
import { seededRandomInt } from '../shared/coinche/testkit'
import type { OnlineGame } from '../shared/coinche/types'
import type { RoomView } from '../shared/coinche/views'
import { Bot } from './bots'

const [, , outDir = 'test-results/shots', widthArg = '390', engine = 'chromium', only = ''] = process.argv
const WIDTH = Number(widthArg)
const BASE = 'http://127.0.0.1:5199'
const ORIGIN = BASE
mkdirSync(outDir, { recursive: true })
const rnd = seededRandomInt(7)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Intent = { type: string } & Record<string, unknown>

/** Prochaine action autorisée d'un joueur (tous jeux). Ne choisit que parmi les actions annoncées par le serveur. */
export function intent(v: RoomView, opts: { bidChance?: number } = {}): Intent | null {
  if (v.status !== 'playing' || v.pause) return null
  const t = v.tarot
  if (t) {
    const a = t.actions
    if (a.next) return { type: 'nextRound' }
    if (a.playable.length) return { type: 'tarotPlay', card: a.playable[0] }
    if (a.discard.length) return { type: 'tarotDiscard', cards: a.discard.slice(0, t.dogSize) }
    if (a.canDeclare) return { type: 'tarotDeclare', types: [], shown: [] }
    if (a.calls.length) return { type: 'tarotCall', card: a.calls[0] }
    if (a.bids.length && rnd(2) === 0) return { type: 'tarotBid', contract: a.bids[0] }
    return a.canPass ? { type: 'pass' } : null
  }
  const a = v.actions
  if (a.playable.length) return { type: 'playCard', card: a.playable[0] }
  if (a.canReadyNext) return { type: 'nextRound' }
  if (a.canAcceptCoinche) return { type: 'acceptCoinche' }
  if (a.takeSuits.length && rnd(100) / 100 < (opts.bidChance ?? 0.4)) return { type: 'take', suit: a.takeSuits[0] }
  if (a.bid && rnd(100) / 100 < (opts.bidChance ?? 0.4)) return { type: 'bid', value: a.bid.min, suit: SUITS[rnd(4)] }
  return a.canPass ? { type: 'pass' } : null
}

const store = `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s`

class Human {
  constructor(
    readonly ctx: BrowserContext,
    readonly page: Page,
    readonly name: string,
  ) {}
  view(): Promise<RoomView | null> {
    return this.page.evaluate(
      `JSON.parse(JSON.stringify(${store}.get('online').view ?? null))`,
    ) as Promise<RoomView | null>
  }
  async act(i: Intent): Promise<void> {
    const { type, ...rest } = i
    await this.page.evaluate(`${store}.get('online').send(${JSON.stringify(type)}, ${JSON.stringify(rest)})`)
  }
}

async function newHuman(browser: Browser, name: string, width = WIDTH): Promise<Human> {
  const ctx = await browser.newContext({
    viewport: { width, height: width >= 700 ? 900 : 844 },
    deviceScaleFactor: width >= 700 ? 1 : 2,
    hasTouch: width < 700,
    isMobile: width < 700 && engine === 'chromium',
    locale: 'fr-FR',
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/#/`)
  await page.waitForFunction(`!!${store}.get('data') && ${store}.get('data').ready`)
  await page.waitForTimeout(300)
  return new Human(ctx, page, name)
}

async function shot(page: Page, name: string, full = false): Promise<void> {
  if (only && !name.includes(only)) return
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: full, timeout: 10000 }).catch(() => undefined)
  console.log('capture', name)
}

// ---------- Compteur (hors ligne) ----------
async function counter(browser: Browser): Promise<void> {
  const h = await newHuman(browser, 'compteur')
  const p = h.page
  await shot(p, '01-accueil-vide')
  const seed = `(async () => {
    const d = ${store}.get('data')
    const ps = []
    for (const n of ['Anne', 'Bob', 'Cléo', 'Dan', 'Éva', 'Félix']) ps.push(await d.addPlayer(n))
    const soiree = await d.addEvening('Soirée du vendredi', '2026-11-06')
    const mk = (takerId, takerTeam, contract, trump, level, takerPoints, allTricks = false) => ({ takerId, takerTeam, contract, trump, level, takerPoints, allTricks, beloteTeam: null })
    const g = await d.createGame({ kind: 'coinche', eveningId: soiree.id, teamA: [ps[0].id, ps[2].id], teamB: [ps[1].id, ps[3].id], teamNames: ['Anne & Cléo', 'Bob & Dan'], firstDealerId: ps[0].id, rules: { kind: 'coinche', rounding: 'rounded', target: 3000 } })
    const rows = [[0,0,90,'coeur','none',100],[1,1,100,'pique','coinche',70],[2,0,80,'trefle','none',95],[3,1,120,'carreau','none',110],[0,0,110,'pique','none',60]]
    for (const [i, t, c, s, l, pts] of rows) { const dealer = ps[[0,1,2,3][i % 4]].id; const takerId = ps[t === 0 ? [0,2][i % 2] : [1,3][i % 2]].id; await d.saveDeal(g.id, { id: 'deal' + i, dealerId: dealer, passed: false, input: { ...mk(takerId, t, c, s, l, pts), coincheTeam: l === 'coinche' ? 0 : null }, createdAt: new Date().toISOString() }) }
    const b = await d.createGame({ kind: 'belote', eveningId: null, teamA: [ps[0].id, ps[2].id], teamB: [ps[1].id, ps[3].id], teamNames: ['', ''], firstDealerId: ps[1].id, rules: { kind: 'belote', rounding: 'rounded', target: 1000, announcements: true } })
    const t = await d.createGame({ kind: 'tarot', eveningId: null, tarotPlayers: ps.slice(0, 5).map(x => x.id), firstDealerId: ps[0].id, rules: (await import('/src/engine/types.ts')).defaultRules('tarot') })
    return [g.id, b.id, t.id]
  })()`
  const ids = (await p.evaluate(seed)) as string[]
  await p.goto(`${BASE}/#/`)
  await shot(p, '02-accueil', true)
  await p.goto(`${BASE}/#/nouvelle`)
  await shot(p, '03-nouvelle-partie', true)
  await p.goto(`${BASE}/#/partie/${ids[0]}`)
  await shot(p, '04-partie-coinche', true)
  await p.goto(`${BASE}/#/partie/${ids[0]}/donne`)
  await shot(p, '05-saisie-coinche', true)
  await p.goto(`${BASE}/#/partie/${ids[1]}/donne`)
  await shot(p, '06-saisie-belote', true)
  await p.goto(`${BASE}/#/partie/${ids[2]}/donne`)
  await shot(p, '07-saisie-tarot', true)
  await p.goto(`${BASE}/#/partie/${ids[0]}/detail/deal1`)
  await shot(p, '08-detail-donne', true)
  await p.goto(`${BASE}/#/historique`)
  await shot(p, '09-historique')
  await p.goto(`${BASE}/#/soirees`)
  await shot(p, '10-soirees')
  await p.goto(`${BASE}/#/classements`)
  await shot(p, '11-classements')
  await p.goto(`${BASE}/#/parametres`)
  await shot(p, '12-reglages', true)
  await h.ctx.close()
}

// ---------- En ligne ----------
const GAMES: Record<string, { game: OnlineGame; n: number }> = {
  coinche: { game: 'coinche', n: 4 },
  belote: { game: 'belote', n: 4 },
  'belote-annonces': { game: 'belote-annonces', n: 4 },
  'tarot-3': { game: 'tarot-3', n: 3 },
  tarot: { game: 'tarot', n: 4 },
  'tarot-5': { game: 'tarot-5', n: 5 },
  'tarot-6': { game: 'tarot-6', n: 6 },
}
const NAMES = ['Anne', 'Bob', 'Cléo', 'Dan', 'Éva', 'Félix']

async function setup(browser: Browser, key: string, opts: { dealer?: number; names?: string[] } = {}) {
  const { game, n } = GAMES[key]
  const names = opts.names ?? NAMES
  const me = await newHuman(browser, names[0])
  await me.page.goto(`${BASE}/#/en-ligne`)
  await me.page.waitForFunction(`!!${store}.get('online')`)
  const roomId = (await me.page.evaluate(
    `${store}.get('online').createRoom(${JSON.stringify(names[0])}, ${JSON.stringify(game)})`,
  )) as string
  await me.page.evaluate(`location.hash = '#/en-ligne/salon/${roomId}'`)
  const v0 = (await waitView(me, () => true))!
  const bots: Bot[] = []
  for (let i = 1; i < n; i++) {
    const b = new Bot({ url: BASE, name: names[i], origin: ORIGIN, xff: `10.1.${rnd(200)}.${i}` })
    await b.connect()
    const ack = await b.call('room:join', { code: v0.code, nickname: names[i] })
    if (!ack.ok) throw new Error(`join ${names[i]} : ${ack.message}`)
    b.grant = ack.grant!
    bots.push(b)
  }
  return { me, bots, n, v0, names }
}

async function waitView(me: Human, pred: (v: RoomView) => boolean, ms = 8000): Promise<RoomView | null> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = await me.view()
    if (v && pred(v)) return v
    await sleep(40)
  }
  return null
}

async function seatAll(me: Human, bots: Bot[], ready = true, dealer?: number): Promise<void> {
  await me.act({ type: 'takeSeat', seat: 0 })
  for (const [i, b] of bots.entries()) await b.cmd('takeSeat', { seat: i + 1 })
  if (dealer != null) await me.act({ type: 'configure', firstDealer: dealer })
  if (ready) {
    await sleep(150)
    await me.act({ type: 'setReady', ready: true })
    for (const b of bots) await b.cmd('setReady', { ready: true })
  }
  await sleep(200)
}

/** Fait jouer tout le monde (le vrai navigateur via son store) jusqu'à ce que `until` soit vrai chez lui. */
async function drive(
  me: Human,
  bots: Bot[],
  until: (v: RoomView) => boolean,
  ms = 60000,
  opts = {},
): Promise<RoomView> {
  const t0 = Date.now()
  let last = -1
  while (Date.now() - t0 < ms) {
    const v = await me.view()
    if (v && until(v)) return v
    let acted = false
    for (const b of bots) {
      if (!b.view) continue
      const i = intent(b.view, opts)
      if (i) {
        const { type, ...rest } = i
        const ack = await b.cmd(type, rest)
        if (ack.ok) acted = true
      }
    }
    const mv = await me.view()
    if (mv && !until(mv)) {
      const i = intent(mv, opts)
      if (i && mv.version !== last) {
        last = mv.version
        await me.act(i)
        acted = true
      }
    }
    if (!acted) await sleep(40)
  }
  throw new Error('état non atteint')
}

function closeAll(me: Human, bots: Bot[]): Promise<void> {
  for (const b of bots) b.disconnect()
  return me.ctx.close()
}

async function lobbyShots(browser: Browser): Promise<void> {
  const { me, bots } = await setup(browser, 'coinche')
  await shot(me.page, '20-salon-hote-debut', true)
  await me.act({ type: 'takeSeat', seat: 0 })
  await bots[0].cmd('takeSeat', { seat: 1 })
  await sleep(300)
  await shot(me.page, '21-salon-hote-partiel', true)
  // Invité sur un second téléphone, via le lien partagé.
  const v = (await me.view())!
  const guest = await newHuman(browser, 'Invité')
  await guest.page.goto(`${BASE}/#/en-ligne/rejoindre/${v.code}`)
  await shot(guest.page, '22-invite-lien', true)
  await guest.page.evaluate(`${store}.get('online').joinRoom(${JSON.stringify(v.code)}, 'Inès')`)
  await sleep(500)
  await shot(guest.page, '23-salon-invite', true)
  await bots[1].cmd('takeSeat', { seat: 2 })
  await guest.act({ type: 'takeSeat', seat: 3 })
  await me.act({ type: 'setReady', ready: true })
  await bots[0].cmd('setReady', { ready: true })
  await sleep(300)
  await shot(me.page, '24-salon-presque-pret', true)
  await shot(guest.page, '25-salon-invite-assis', true)
  await guest.ctx.close()
  await closeAll(me, bots)
  const h = await newHuman(browser, 'x')
  await h.page.goto(`${BASE}/#/en-ligne`)
  await shot(h.page, '19-en-ligne-accueil', true)
  await h.ctx.close()
}

async function coincheShots(browser: Browser): Promise<void> {
  const { me, bots } = await setup(browser, 'coinche')
  await seatAll(me, bots, true, 3)
  await me.act({ type: 'start' })
  await waitView(me, (v) => v.status === 'playing')
  // Attente (pas mon tour) puis mon tour d'enchérir.
  await shot(me.page, '30-encheres-attente')
  await drive(me, bots, (x) => !!x.actions.bid && x.round?.phase === 'bidding', 20000, { bidChance: 0.1 })
  await shot(me.page, '31-encheres-mon-tour', true)
  // Contrat posé par un autre puis coinche.
  await me.act({ type: 'pass' })
  const v = await drive(me, bots, (x) => !!x.actions.coinche, 20000, { bidChance: 1 })
  await shot(me.page, '32-encheres-coinche-possible', true)
  await me.act({ type: 'coinche', contractRef: v.actions.coinche!.contractRef })
  await waitView(me, (x) => x.round?.phase === 'window')
  await shot(me.page, '33-fenetre-coinche')
  await drive(me, bots, (x) => x.round?.phase === 'playing', 20000)
  await drive(
    me,
    bots,
    (x) => x.actions.playable.length > 0 && (x.round?.tricks.length ?? 0) >= 1 && (x.round?.trick.length ?? 0) >= 1,
    30000,
  )
  await shot(me.page, '34-table-mon-tour')
  await shot(me.page, '34-table-mon-tour-complet', true)
  await drive(me, bots, (x) => x.round?.phase === 'summary', 90000)
  await shot(me.page, '35-resume-donne')
  await shot(me.page, '35-resume-donne-complet', true)
  // Pause : un joueur se déconnecte.
  await me.act({ type: 'nextRound' })
  for (const b of bots) await b.cmd('nextRound')
  await waitView(me, (x) => x.round?.phase === 'bidding')
  bots[1].disconnect()
  await waitView(me, (x) => !!x.pause)
  await shot(me.page, '36-pause')
  await closeAll(me, bots)
}

async function beloteShots(browser: Browser): Promise<void> {
  const { me, bots } = await setup(browser, 'belote-annonces')
  await seatAll(me, bots, true, 3)
  await me.act({ type: 'start' })
  await waitView(me, (v) => v.status === 'playing')
  await drive(me, bots, (x) => !!x.round?.beloteDeal && x.actions.takeSuits.length > 0, 20000, { bidChance: 0 })
  await shot(me.page, '40-belote-prise-atout', true)
  await drive(
    me,
    bots,
    (x) => x.round?.phase === 'playing' && x.actions.playable.length > 0 && x.round.tricks.length === 0,
    30000,
    { bidChance: 0.9 },
  )
  await shot(me.page, '41-belote-premier-pli', true)
  await drive(
    me,
    bots,
    (x) =>
      (x.round?.tricks.length ?? 0) === 1 &&
      x.actions.playable.length > 0 &&
      (x.round?.announcements?.revealed.length ?? 0) > 0,
    60000,
    { bidChance: 0.9 },
  ).catch(() => undefined)
  await shot(me.page, '42-belote-annonces-revelees', true)
  await closeAll(me, bots)
}

async function tarotShots(browser: Browser, key: string, withDeal = false): Promise<void> {
  const { me, bots, n } = await setup(browser, key)
  await seatAll(me, bots, true, key === 'tarot-6' ? 0 : 3 % n)
  await me.act({ type: 'start' })
  await waitView(me, (v) => v.status === 'playing')
  const t = (x: RoomView) => x.tarot!
  await shot(me.page, `50-${key}-donne-debut`)
  await drive(me, bots, (x) => !!x.tarot && t(x).actions.bids.length > 0, 20000)
  await shot(me.page, `51-${key}-encheres`, true)
  await me.act({ type: 'tarotBid', contract: 'garde' }).catch(() => undefined)
  await drive(me, bots, (x) => !!x.tarot && x.tarot.phase !== 'bidding' && x.tarot.taker !== null, 20000, {})
  const mid = (await me.view())!
  const amTaker = t(mid).taker === mid.you.seat
  await shot(me.page, `52-${key}-apres-encheres`)
  // Si ce n'est pas moi le preneur, jouer jusqu'au tour.
  await drive(
    me,
    bots,
    (x) =>
      !!x.tarot &&
      ['call', 'discard', 'declare', 'playing'].includes(t(x).phase) &&
      (t(x).actions.calls.length > 0 ||
        t(x).actions.discard.length > 0 ||
        t(x).actions.canDeclare ||
        t(x).actions.playable.length > 0),
    30000,
  )
  await shot(me.page, `53-${key}-phase-mon-tour`, true)
  void amTaker
  await drive(
    me,
    bots,
    (x) => !!x.tarot && t(x).phase === 'playing' && t(x).actions.playable.length > 0 && t(x).trick.length >= 1,
    40000,
  )
  if (key === 'tarot-3') {
    const cards = me.page.getByTestId('hand-card')
    if ((await cards.count()) !== 24) throw new Error(`Main tarot à 3 : ${await cards.count()} cartes au lieu de 24`)
    const boxes = await cards.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      }),
    )
    if (boxes.some((b) => b.width < 40)) throw new Error(`Cible de carte trop étroite à ${WIDTH}px`)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!
        const b = boxes[j]!
        if (Math.abs(a.y - b.y) < 1 && a.x + a.width > b.x + 0.5)
          throw new Error(`Cibles de cartes superposées (${i}, ${j}) à ${WIDTH}px`)
      }
    }
    if (!(await me.page.getByTestId('current-trick').isVisible()))
      throw new Error('Accès au pli en cours absent à portée de main')
    await me.page.getByTestId('current-trick').click()
    if (!(await me.page.getByRole('dialog', { name: 'Pli en cours' }).isVisible()))
      throw new Error('Le pli en cours ne peut pas être agrandi')
    await me.page.getByTestId('sheet-close').click()
    if (!(await me.page.getByTestId('play-card').isVisible())) throw new Error('Action Jouer absente avant sélection')
    const playable = me.page.locator('[data-testid="hand-card"][data-state="playable"]').first()
    await playable.click()
    if ((await me.page.locator('[data-testid="hand-card"][data-state="selected"]').count()) !== 1)
      throw new Error('La sélection ne marque pas exactement une carte')
    if (!(await me.page.getByTestId('play-card').isVisible())) throw new Error('Action Jouer absente après sélection')
    await me.page.getByTestId('preview-card').click()
    if (!(await me.page.getByTestId('card-preview').isVisible())) throw new Error('Agrandissement de carte absent')
    if ((await cards.count()) !== 24 || !(await me.page.getByTestId('play-card').isVisible()))
      throw new Error('L’aperçu a joué la carte ou masqué l’action')
    await me.page.getByTestId('sheet-close').click()
  }
  await shot(me.page, `54-${key}-jeu`, true)
  if (withDeal) {
    await drive(me, bots, (x) => !!x.tarot && t(x).phase === 'summary', 120000)
    await shot(me.page, `55-${key}-resume`, true)
  }
  await closeAll(me, bots)
}

async function longNames(browser: Browser): Promise<void> {
  const L = [
    'Anne-Sophie-Marguerit',
    'Wolfeschlegelsteinha',
    'Jean-Baptiste-Emmanu',
    'ÉléonoreDeLaFontaine',
    'Maximilien-Alexandre',
    'Marie-Charlotte-Amél',
  ].map((n) => [...n].slice(0, 20).join(''))
  const { me, bots } = await setup(browser, 'tarot-6', { names: L })
  await seatAll(me, bots, true, 0)
  await me.act({ type: 'start' })
  await waitView(me, (v) => v.status === 'playing')
  await drive(me, bots, (x) => !!x.tarot && x.tarot.phase === 'playing' && x.tarot.actions.playable.length > 0, 60000)
  await shot(me.page, '60-pseudos-longs-tarot6', true)
  await closeAll(me, bots)
}

const browser = await (engine === 'webkit' ? webkit : chromium).launch({
  ...(engine === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
})
const steps: [string, () => Promise<void>][] = [
  ['compteur', () => counter(browser)],
  ['salon', () => lobbyShots(browser)],
  ['coinche', () => coincheShots(browser)],
  ['belote', () => beloteShots(browser)],
  ['tarot3', () => tarotShots(browser, 'tarot-3')],
  ['tarot4', () => tarotShots(browser, 'tarot', true)],
  ['tarot5', () => tarotShots(browser, 'tarot-5')],
  ['tarot6', () => tarotShots(browser, 'tarot-6')],
  ['longs', () => longNames(browser)],
]
const stepFilter = process.env.STEPS?.split(',')
for (const [name, fn] of steps) {
  if (stepFilter && !stepFilter.includes(name)) continue
  try {
    await fn()
  } catch (e) {
    console.error(`ÉCHEC ${name} :`, (e as Error).message)
  }
}
await browser.close()
process.exit(0)
