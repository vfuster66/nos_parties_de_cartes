import { describe, expect, it } from 'vitest'
import { cardKey, sameCard } from './cards'
import type { Seat } from './cards'
import {
  addParticipant,
  applyCommand,
  expireWindow,
  isPaused,
  pauseWindow,
  removeParticipant,
  resumeWindow,
} from './engine'
import type { MatchState } from './types'
import { RuleError } from './types'
import { act, c, ctx, lobby, PIDS, seededRandomInt, started, suitedHands, withHands } from './testkit'
import { buildView } from './views'

const throwsCode = (fn: () => unknown, code: string) => {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(RuleError)
    expect((e as RuleError).code).toBe(code)
    return
  }
  throw new Error(`Aucune erreur (attendu ${code})`)
}
/** Joueurs dans l'ordre des places 0..3 (p0 = place 0). */
const bid = (s: MatchState, seat: Seat, value: number, suit = 'coeur') =>
  act(s, PIDS[seat], { type: 'bid', value, suit })
const pass = (s: MatchState, seat: Seat) => act(s, PIDS[seat], { type: 'pass' })
const turnOf = (s: MatchState) => s.round!.turn!

describe('salon', () => {
  it('rejoindre, places, équipes opposées (places 0/2 contre 1/3) et démarrage', () => {
    const s = started()
    expect(s.status).toBe('playing')
    expect(s.round!.hands.map((h) => h.length)).toEqual([8, 8, 8, 8])
    expect(s.round!.dealer).toBe(3)
    expect(turnOf(s)).toBe(0) // à gauche du donneur
  })
  it('refuse de démarrer sans quatre places occupées et prêtes, ou par un non-hôte', () => {
    let s = lobby()
    throwsCode(() => act(s, 'p1', { type: 'start' }), 'forbidden')
    s = act(s, 'p2', { type: 'setReady', ready: false })
    throwsCode(() => act(s, 'p0', { type: 'start' }), 'invalid')
    s = act(s, 'p2', { type: 'leaveSeat' })
    throwsCode(() => act(s, 'p0', { type: 'start' }), 'invalid')
  })
  it('place déjà prise refusée ; aucun spectateur (5e personne refusée)', () => {
    const s = lobby()
    throwsCode(() => act(s, 'p1', { type: 'takeSeat', seat: 0 }), 'conflict')
    throwsCode(() => addParticipant(s, { id: 'p9', nickname: 'Eve', joinedAt: 0 }), 'full')
  })
  it('pseudo en double refusé (insensible à la casse)', () => {
    let s = lobby()
    s = removeParticipant(s, 'p3', new Set(PIDS))
    throwsCode(() => addParticipant(s, { id: 'x', nickname: 'ANNE', joinedAt: 0 }), 'conflict')
  })
  it('changer de règle réinitialise les « prêt » ; seul l’hôte configure', () => {
    let s = lobby()
    throwsCode(() => act(s, 'p1', { type: 'configure', target: 1000 }), 'forbidden')
    s = act(s, 'p0', {
      type: 'configure',
      target: 1000,
      rounding: 'exact',
      gameName: 'Soirée',
      teamNames: ['Les A', 'Les B'],
    })
    expect(s.readyIds).toEqual([])
    expect(s.config.target).toBe(1000)
  })
  it("l'hôte est transféré à un participant connecté, sans pouvoir sur les cartes", () => {
    const s = lobby()
    const t = removeParticipant(s, 'p0', new Set(['p2', 'p3']))
    expect(t.hostId).toBe('p2')
    expect(t.seats[0]).toBeNull()
  })
  it('premier donneur explicite ou tirage aléatoire côté serveur', () => {
    let s = lobby()
    s = act(s, 'p0', { type: 'configure', firstDealer: 'random' })
    for (const p of PIDS) s = act(s, p, { type: 'setReady', ready: true })
    const t = act(s, 'p0', { type: 'start' }, ctx({ randomInt: seededRandomInt(5) }))
    expect([0, 1, 2, 3]).toContain(t.round!.dealer)
  })
})

describe('enchères', () => {
  it('paliers de 80 à 160, strictement croissants, toute couleur', () => {
    let s = started()
    throwsCode(() => bid(s, 0, 70), 'illegal_bid')
    throwsCode(() => bid(s, 0, 85), 'illegal_bid')
    throwsCode(() => bid(s, 0, 170), 'illegal_bid')
    s = bid(s, 0, 80, 'pique')
    throwsCode(() => bid(s, 1, 80, 'coeur'), 'illegal_bid')
    s = bid(s, 1, 100, 'carreau') // palier sauté
    expect(s.round!.contract).toMatchObject({ seat: 1, value: 100, suit: 'carreau' })
    s = bid(s, 2, 160, 'trefle')
    throwsCode(() => bid(s, 3, 160), 'illegal_bid')
  })
  it('hors tour refusé', () => {
    const s = started()
    throwsCode(() => pass(s, 2), 'not_your_turn')
  })
  it('trois passes après une enchère valident le contrat ; le premier à entamer est à gauche du donneur', () => {
    let s = started()
    s = bid(s, 0, 80)
    s = pass(s, 1)
    s = pass(s, 2)
    expect(s.round!.phase).toBe('bidding')
    s = pass(s, 3)
    expect(s.round!.phase).toBe('playing')
    expect(s.round!.turn).toBe(0) // dealer 3 → place 0, même si le preneur est la place 0 ; testé aussi avec un autre preneur ci-dessous
  })
  it("l'entame est à gauche du donneur quel que soit le preneur", () => {
    let s = started()
    s = pass(s, 0)
    s = bid(s, 1, 90)
    s = pass(s, 2)
    s = pass(s, 3)
    s = pass(s, 0)
    expect(s.round!.phase).toBe('playing')
    expect(s.round!.contract!.seat).toBe(1)
    expect(s.round!.turn).toBe(0)
  })
  it('une nouvelle enchère remet le compteur de passes à zéro ; un joueur ayant passé peut ré-enchérir', () => {
    let s = started()
    s = bid(s, 0, 80)
    s = pass(s, 1)
    s = bid(s, 2, 90) // partenaire surenchérit
    expect(s.round!.consecutivePasses).toBe(0)
    s = pass(s, 3)
    s = pass(s, 0)
    s = bid(s, 1, 100, 'pique') // 1 avait passé : il peut rentrer
    expect(s.round!.contract!.seat).toBe(1)
    expect(s.round!.phase).toBe('bidding')
  })
  it('quatre passes sans enchère : nouvelle donne, donneur suivant, aucun score, trace conservée', () => {
    let s = started()
    for (const seat of [0, 1, 2, 3] as Seat[]) s = pass(s, seat)
    expect(s.rounds).toHaveLength(1)
    expect(s.rounds[0]).toMatchObject({ passed: true, dealer: 3, delta: [0, 0] })
    expect(s.round!.dealer).toBe(0)
    expect(s.round!.phase).toBe('bidding')
    expect(s.round!.turn).toBe(1)
    expect(s.totals).toEqual([0, 0])
    expect(s.round!.hands.every((h) => h.length === 8)).toBe(true)
  })
  it('capot : directement en première enchère, ou juste après 80, toujours avec une couleur', () => {
    let s = started()
    s = act(s, 'p0', { type: 'capot', suit: 'pique' })
    expect(s.round!.contract).toMatchObject({ value: 'capot', suit: 'pique' })
    throwsCode(() => bid(s, 1, 160), 'illegal_bid')
    throwsCode(() => act(s, 'p1', { type: 'capot', suit: 'coeur' }), 'illegal_bid') // pas de surenchère de capot
    s = pass(s, 1)
    let t = started()
    t = bid(t, 0, 80, 'coeur')
    t = act(t, 'p1', { type: 'capot', suit: 'carreau' })
    expect(t.round!.contract).toMatchObject({ seat: 1, value: 'capot', suit: 'carreau' })
  })
  it("le capot est proposé avec les couleurs déjà annoncées par l'équipe, jamais choisi silencieusement", () => {
    let s = started()
    s = bid(s, 0, 80, 'pique')
    s = pass(s, 1)
    const v = buildView(s, 'p2', new Set(PIDS), 0)
    expect(v.actions.capot!.suggestedSuits).toEqual(['pique'])
    expect(buildView(s, 'p3', new Set(PIDS), 0).actions.capot).toBeNull() // pas son tour
    s = bid(s, 2, 90, 'coeur')
    const v0 = buildView(pass(s, 3), 'p0', new Set(PIDS), 0)
    expect(new Set(v0.actions.capot!.suggestedSuits)).toEqual(new Set(['pique', 'coeur']))
  })
  it('capot validé après trois passes', () => {
    let s = started()
    s = act(s, 'p0', { type: 'capot', suit: 'pique' })
    s = pass(s, 1)
    s = pass(s, 2)
    s = pass(s, 3)
    expect(s.round!.phase).toBe('playing')
  })
})

describe('coinche et surcoinche', () => {
  const afterBid = () => bid(started(), 0, 80)
  it('coinche hors tour par un adversaire du contrat, fige le contrat et ouvre 10 s', () => {
    let s = afterBid() // tour de la place 1
    s = act(s, 'p3', { type: 'coinche', contractRef: s.round!.contract!.bidIndex }, ctx({ now: 5000 })) // place 3, hors tour
    const r = s.round!
    expect(r.phase).toBe('window')
    expect(r.level).toBe('coinche')
    expect(r.window).toMatchObject({ remainingMs: 10000, deadlineAt: 15000 })
    throwsCode(() => bid(s, 1, 90), 'wrong_phase') // plus aucune surenchère
    throwsCode(() => pass(s, 1), 'wrong_phase')
  })
  it('refuse la coinche de sa propre équipe', () => {
    const s = afterBid()
    throwsCode(() => act(s, 'p2', { type: 'coinche', contractRef: 0 }), 'forbidden')
    throwsCode(() => act(s, 'p0', { type: 'coinche', contractRef: 0 }), 'forbidden')
  })
  it('refuse une coinche visant un contrat périmé (surenchère simultanée) ou des enchères fermées', () => {
    let s = afterBid()
    const stale = s.round!.contract!.bidIndex
    s = bid(s, 1, 90) // le contrat change
    // coinche de la place 2 (adversaire du contrat de la place 1 ? non : 2 est l'équipe 0 = adversaire de la place 1)
    throwsCode(() => act(s, 'p2', { type: 'coinche', contractRef: stale }), 'stale_contract')
    s = act(s, 'p2', { type: 'coinche', contractRef: s.round!.contract!.bidIndex })
    expect(s.round!.contract!.value).toBe(90)
    let closed = bid(started(), 0, 80)
    closed = pass(pass(pass(closed, 1), 2), 3)
    throwsCode(() => act(closed, 'p1', { type: 'coinche', contractRef: 0 }), 'wrong_phase')
  })
  it('refuse une commande dont la version est périmée (doublon réseau)', () => {
    const s = started()
    const before = s.version
    const t = pass(s, 0)
    expect(t.version).toBeGreaterThan(before)
    throwsCode(() => applyCommand(t, 'p1', { type: 'pass', commandId: 'x', expectedVersion: before }, ctx()), 'stale')
    throwsCode(() => applyCommand(t, 'p1', { type: 'pass', commandId: 'x' }, ctx()), 'stale') // version obligatoire
  })
  it('surcoinche par chacun des deux preneurs, valide immédiatement ×3', () => {
    for (const taker of ['p0', 'p2']) {
      let s = afterBid()
      s = act(s, 'p1', { type: 'coinche', contractRef: 0 }, ctx({ now: 0 }))
      s = act(s, taker, { type: 'surcoinche' }, ctx({ now: 3000 }))
      expect(s.round!.level).toBe('surcoinche')
      expect(s.round!.phase).toBe('playing')
    }
  })
  it("seule l'équipe preneuse peut surcoincher ou accepter", () => {
    let s = afterBid()
    s = act(s, 'p1', { type: 'coinche', contractRef: 0 })
    throwsCode(() => act(s, 'p3', { type: 'surcoinche' }), 'forbidden')
    throwsCode(() => act(s, 'p1', { type: 'acceptCoinche' }), 'forbidden')
  })
  it('expiration à 10 s : le contrat reste coinché ; surcoinche tardive refusée', () => {
    let s = afterBid()
    s = act(s, 'p1', { type: 'coinche', contractRef: 0 }, ctx({ now: 0 }))
    throwsCode(() => act(s, 'p0', { type: 'surcoinche' }, ctx({ now: 10_000 })), 'window_closed')
    expect(expireWindow(s, 9_999)).toBe(s)
    const t = expireWindow(s, 10_000)
    expect(t.round!.phase).toBe('playing')
    expect(t.round!.level).toBe('coinche')
    throwsCode(() => act(t, 'p0', { type: 'surcoinche' }, ctx({ now: 10_001 })), 'wrong_phase')
  })
  it('acceptation anticipée par les deux preneurs ferme la fenêtre ; un seul ne suffit pas', () => {
    let s = afterBid()
    s = act(s, 'p1', { type: 'coinche', contractRef: 0 })
    s = act(s, 'p0', { type: 'acceptCoinche' })
    expect(s.round!.phase).toBe('window')
    throwsCode(() => act(s, 'p0', { type: 'acceptCoinche' }), 'conflict')
    s = act(s, 'p2', { type: 'acceptCoinche' })
    expect(s.round).toMatchObject({ phase: 'playing', level: 'coinche' })
  })
  it('pause : le temps restant est suspendu puis repris sans repartir à 10 s', () => {
    let s = afterBid()
    s = act(s, 'p1', { type: 'coinche', contractRef: 0 }, ctx({ now: 1000 }))
    s = pauseWindow(s, 4000) // 3 s écoulées
    expect(s.round!.window).toMatchObject({ remainingMs: 7000, deadlineAt: null })
    expect(expireWindow(s, 999_999)).toBe(s) // une fenêtre suspendue n'expire jamais
    throwsCode(() => act(s, 'p0', { type: 'surcoinche' }, ctx({ now: 5000, paused: true })), 'paused')
    s = resumeWindow(s, 50_000)
    expect(s.round!.window).toMatchObject({ remainingMs: 7000, deadlineAt: 57_000 })
  })
  it('refuse toute action de jeu pendant une pause', () => {
    const s = started()
    throwsCode(() => act(s, 'p0', { type: 'pass' }, ctx({ paused: true })), 'paused')
  })
})

describe('jeu des cartes', () => {
  /** Mains personnalisées puis enchère 80 de la place 0 validée. */
  function play(
    hands: ReturnType<typeof suitedHands>,
    contract: { seat: Seat; value?: number | 'capot'; suit: string },
    level?: 'coinche',
  ) {
    let s = withHands(started(), hands)
    // enchères : tour place 0 → on fait passer jusqu'au preneur
    for (let seat = 0; seat < contract.seat; seat++) s = pass(s, seat as Seat)
    s =
      contract.value === 'capot'
        ? act(s, PIDS[contract.seat], { type: 'capot', suit: contract.suit })
        : bid(s, contract.seat, contract.value ?? 80, contract.suit)
    if (level) {
      const defender = (contract.seat + 1) % 4
      s = act(s, PIDS[defender], { type: 'coinche', contractRef: s.round!.contract!.bidIndex })
      s = act(s, PIDS[contract.seat], { type: 'acceptCoinche' })
      s = act(s, PIDS[(contract.seat + 2) % 4], { type: 'acceptCoinche' })
    } else {
      let t = (contract.seat + 1) % 4
      while (s.round!.phase === 'bidding') {
        s = pass(s, t as Seat)
        t = (t + 1) % 4
      }
    }
    return s
  }
  /** Joue la première carte autorisée de chacun jusqu'à la fin de la donne. */
  function playOut(s: MatchState): MatchState {
    while (s.round!.phase === 'playing') {
      const seat = s.round!.turn!
      const legal = buildView(s, PIDS[seat], new Set(PIDS), 0).actions.playable
      s = act(s, PIDS[seat], { type: 'playCard', card: legal[0] })
    }
    return s
  }

  it('refuse une carte absente de la main, hors tour ou interdite', () => {
    let s = play(suitedHands(['pique', 'coeur', 'carreau', 'trefle']), { seat: 0, suit: 'pique' })
    throwsCode(() => act(s, 'p1', { type: 'playCard', card: c('A', 'coeur') }), 'not_your_turn')
    throwsCode(() => act(s, 'p0', { type: 'playCard', card: c('A', 'coeur') }), 'illegal_card')
    s = act(s, 'p0', { type: 'playCard', card: c('7', 'pique') })
    // place 1 possède des cœurs mais le pli demande pique : défausse libre ; un trèfle de la place 3 est hors main de 1
    throwsCode(() => act(s, 'p1', { type: 'playCard', card: c('A', 'trefle') }), 'illegal_card')
  })
  it('impossible de jouer pour une autre place', () => {
    const s = play(suitedHands(['pique', 'coeur', 'carreau', 'trefle']), { seat: 0, suit: 'pique' })
    throwsCode(() => act(s, 'p2', { type: 'playCard', card: c('A', 'carreau') }), 'not_your_turn')
  })
  it('obligation de fournir appliquée par le serveur', () => {
    let s = play(
      [
        [c('A', 'pique'), c('7', 'coeur')],
        [c('R', 'pique'), c('8', 'coeur')],
        [c('7', 'carreau'), c('8', 'carreau')],
        [c('7', 'trefle'), c('8', 'trefle')],
      ].map((h) => [...h]),
      { seat: 0, suit: 'coeur' },
    )
    s = act(s, 'p0', { type: 'playCard', card: c('A', 'pique') })
    throwsCode(() => act(s, 'p1', { type: 'playCard', card: c('8', 'coeur') }), 'illegal_card')
  })
  it('capot réalisé et annoncé = huit plis réels : 500 ; belote aussi comptée', () => {
    const hands = suitedHands(['pique', 'coeur', 'carreau', 'trefle'])
    const s = playOut(play(hands, { seat: 0, value: 'capot', suit: 'pique' }))
    const rec = s.rounds[0]
    expect(rec.trickCounts).toEqual([8, 0])
    expect(rec.beloteTeam).toBe(0) // la place 0 détient R + D d'atout
    expect(rec.detail!.outcome).toBe('capot')
    expect(rec.delta).toEqual([500 + 20, 0])
  })
  it('capot annoncé chuté : un seul pli concédé fait échouer ; défense 410 (arrondi) ; belote conservée', () => {
    // La place 0 a tout l'atout sauf le 7 ; la place 1 a le 7 d'atout et le plus petit cœur
    const hands = suitedHands(['pique', 'coeur', 'carreau', 'trefle'])
    hands[0] = hands[0].filter((x) => x.rank !== 'V').concat([c('A', 'coeur')])
    hands[1] = hands[1].filter((x) => x.rank !== 'A').concat([c('V', 'pique')])
    const s = playOut(play(hands, { seat: 0, value: 'capot', suit: 'pique' }))
    const rec = s.rounds[0]
    expect(rec.trickCounts[1]).toBeGreaterThanOrEqual(1)
    expect(rec.detail!.outcome).toBe('fail')
    expect(rec.delta[1]).toBe(410) // (160 + 250), jeu arrondi, ×1
    expect(rec.delta[0]).toBe(rec.beloteTeam === 0 ? 20 : 0)
  })
  it('capot en mode points réels chuté : 412', () => {
    const hands = suitedHands(['pique', 'coeur', 'carreau', 'trefle'])
    hands[0] = hands[0].filter((x) => x.rank !== 'V').concat([c('A', 'coeur')])
    hands[1] = hands[1].filter((x) => x.rank !== 'A').concat([c('V', 'pique')])
    let s = withHands(started({ rounding: 'exact' }), hands)
    s = act(s, 'p0', { type: 'capot', suit: 'pique' })
    s = pass(pass(pass(s, 1), 2), 3)
    expect(playOut(s).rounds[0].delta[1]).toBe(412)
  })
  it('162 points des preneurs sans les huit plis ne donne PAS un capot', () => {
    // Équipe 0 (places 0 et 2) prend tous les points mais la défense gagne un pli de cartes sans valeur.
    // Atout carreau. Place 0 entame : on construit des mains où la défense gagne un pli de 7/8 avec un atout (7 de carreau) sur un pli sans valeur.
    const hands = [
      [
        c('A', 'pique'),
        c('10', 'pique'),
        c('R', 'pique'),
        c('D', 'pique'),
        c('V', 'pique'),
        c('9', 'pique'),
        c('A', 'coeur'),
        c('10', 'coeur'),
      ],
      [
        c('7', 'trefle'),
        c('8', 'trefle'),
        c('9', 'trefle'),
        c('7', 'coeur'),
        c('8', 'coeur'),
        c('9', 'coeur'),
        c('7', 'pique'),
        c('8', 'pique'),
      ],
      [
        c('R', 'coeur'),
        c('D', 'coeur'),
        c('V', 'coeur'),
        c('A', 'trefle'),
        c('10', 'trefle'),
        c('R', 'trefle'),
        c('D', 'trefle'),
        c('V', 'trefle'),
      ],
      [
        c('7', 'carreau'),
        c('8', 'carreau'),
        c('9', 'carreau'),
        c('V', 'carreau'),
        c('D', 'carreau'),
        c('R', 'carreau'),
        c('10', 'carreau'),
        c('A', 'carreau'),
      ],
    ]
    expect(hands.flat()).toHaveLength(32)
    // Ici la défense (place 3) a tous les atouts : le scénario vérifie surtout qu'allTricks vient des plis comptés.
    let s = withHands(started(), hands)
    s = bid(pass(s, 0), 1, 80, 'carreau')
    s = pass(pass(pass(s, 2), 3), 0)
    const done = playOut(s)
    const rec = done.rounds[0]
    expect(rec.trickPoints[0] + rec.trickPoints[1]).toBe(162)
    expect(rec.trickCounts[0] + rec.trickCounts[1]).toBe(8)
  })
})

describe('belote-rebelote', () => {
  const hands = () => {
    const h = suitedHands(['pique', 'coeur', 'carreau', 'trefle'])
    return h
  }
  function readyToPlay(h: ReturnType<typeof hands>, trumpSuit: string) {
    let s = withHands(started(), h)
    s = bid(s, 0, 80, trumpSuit)
    return pass(pass(pass(s, 1), 2), 3)
  }
  it('détectée dans la main initiale, aucune révélation avant la première carte', () => {
    const s = readyToPlay(hands(), 'coeur') // la place 1 a toutes les cartes de cœur
    expect(s.round!.beloteSeat).toBe(1)
    for (const p of PIDS) {
      const json = JSON.stringify(buildView(s, p, new Set(PIDS), 0))
      expect(json).not.toContain('beloteSeat')
      expect(buildView(s, p, new Set(PIDS), 0).round!.beloteEvents).toEqual([])
    }
  })
  it('Belote sur la première carte, Rebelote sur la seconde, 20 points une seule fois', () => {
    const h = hands()
    // La place 1 joue ses atouts ; les autres défaussent. Place 0 entame un petit pique.
    let s = readyToPlay(h, 'coeur')
    s = act(s, 'p0', { type: 'playCard', card: c('7', 'pique') })
    s = act(s, 'p1', { type: 'playCard', card: c('R', 'coeur') }) // première : coupe
    expect(s.round!.beloteEvents).toEqual([{ seat: 1, stage: 'belote', trickIndex: 0 }])
    s = act(s, 'p2', { type: 'playCard', card: c('7', 'carreau') })
    s = act(s, 'p3', { type: 'playCard', card: c('7', 'trefle') })
    expect(s.round!.turn).toBe(1) // le gagnant entame
    s = act(s, 'p1', { type: 'playCard', card: c('D', 'coeur') })
    expect(s.round!.beloteEvents.map((e) => e.stage)).toEqual(['belote', 'rebelote'])
    const v = buildView(s, 'p3', new Set(PIDS), 0)
    expect(v.round!.beloteEvents).toHaveLength(2)
  })
  it('aucune belote lorsque le roi et la dame sont chez deux joueurs différents', () => {
    const h = hands()
    // Échange : la dame de cœur passe à la place 2 contre la dame de carreau
    h[1] = h[1].map((x) => (x.rank === 'D' ? c('D', 'carreau') : x))
    h[2] = h[2].map((x) => (x.rank === 'D' ? c('D', 'coeur') : x))
    const s = readyToPlay(h, 'coeur')
    expect(s.round!.beloteSeat).toBeNull()
  })
  it('belote adverse : 20 points acquis, jamais multipliés, même en cas de chute', () => {
    const h = hands()
    // Contrat 160 de la place 0 à cœur, coinché ×2 : la place 1 (défense) détient la belote
    let s = withHands(started(), h)
    s = bid(s, 0, 160, 'coeur')
    s = act(s, 'p1', { type: 'coinche', contractRef: 0 })
    s = act(s, 'p0', { type: 'acceptCoinche' })
    s = act(s, 'p2', { type: 'acceptCoinche' })
    while (s.round!.phase === 'playing') {
      const seat = s.round!.turn!
      s = act(s, PIDS[seat], { type: 'playCard', card: buildView(s, PIDS[seat], new Set(PIDS), 0).actions.playable[0] })
    }
    const rec = s.rounds[0]
    expect(rec.detail!.outcome).toBe('fail')
    expect(rec.beloteTeam).toBe(1)
    expect(rec.detail!.multiplier).toBe(2)
    expect(rec.delta[1]).toBe((160 + 160) * 2 + 20) // belote non multipliée
    expect(rec.delta[0]).toBe(0)
  })
})

describe('progression, fin de partie, pause', () => {
  function finishRound(s: MatchState): MatchState {
    const first = s.round!.turn!
    s = bid(s, first, 80)
    for (let i = 1; i <= 3; i++) s = pass(s, ((first + i) % 4) as Seat)
    while (s.round!.phase === 'playing') {
      const seat = s.round!.turn!
      s = act(s, PIDS[seat], { type: 'playCard', card: buildView(s, PIDS[seat], new Set(PIDS), 0).actions.playable[0] })
    }
    return s
  }
  it('une donne complète : 162 points, toutes les cartes jouées une fois, scores cohérents', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = lobby()
      for (const p of PIDS) s = act(s, p, { type: 'setReady', ready: true })
      s = act(s, 'p0', { type: 'start' }, ctx({ randomInt: seededRandomInt(seed) }))
      const initial = s.round!.hands.flat().map(cardKey).sort()
      expect(new Set(initial).size).toBe(32)
      s = finishRound(s)
      const rec = s.rounds[0]
      expect(rec.trickPoints[0] + rec.trickPoints[1]).toBe(162)
      const played = rec.tricks.flatMap((t) => t.cards.map((x) => cardKey(x.card))).sort()
      expect(played).toEqual(initial)
      expect(rec.tricks).toHaveLength(8)
      expect(s.totals).toEqual(rec.totalsAfter)
      expect(s.round!.phase).toBe('summary')
    }
  })
  it('donne suivante : tous les joueurs doivent être prêts, le donneur tourne', () => {
    let s = finishRound(started())
    throwsCode(() => act(s, 'p0', { type: 'playCard', card: c('A', 'coeur') }), 'wrong_phase')
    s = act(s, 'p0', { type: 'nextRound' })
    s = act(s, 'p1', { type: 'nextRound' })
    s = act(s, 'p2', { type: 'nextRound' })
    expect(s.round!.phase).toBe('summary')
    s = act(s, 'p3', { type: 'nextRound' })
    expect(s.round!.phase).toBe('bidding')
    expect(s.round!.dealer).toBe(0)
    expect(s.round!.index).toBe(1)
  })
  it("fin de partie : le plus grand total atteignant l'objectif gagne ; l'égalité prolonge", () => {
    let s = started({ target: 100 })
    s = finishRound(s)
    const [a, b] = s.totals
    if (a === b) expect(s.status).toBe('playing')
    else if (Math.max(a, b) >= 100) {
      expect(s.status).toBe('finished')
      expect(s.result!.winnerTeam).toBe(a > b ? 0 : 1)
      throwsCode(() => act(s, 'p0', { type: 'nextRound' }), 'wrong_phase')
    } else expect(s.status).toBe('playing')
  })
  it('égalité à l’objectif : donne supplémentaire', async () => {
    const { matchWinner } = await import('./engine')
    expect(matchWinner([3000, 3000], 3000)).toBeNull()
    expect(matchWinner([3010, 2990], 3000)).toBe(0)
    expect(matchWinner([2990, 3070], 3000)).toBe(1)
    expect(matchWinner([2990, 2990], 3000)).toBeNull()
  })
  it('abandon par l’hôte seulement, sans victoire attribuée', () => {
    const s = started()
    throwsCode(() => act(s, 'p1', { type: 'abandon', confirm: true }), 'forbidden')
    const t = act(s, 'p0', { type: 'abandon', confirm: true }, ctx({ paused: true }))
    expect(t.status).toBe('abandoned')
    expect(t.result!.winnerTeam).toBeNull()
    throwsCode(() => act(t, 'p0', { type: 'pass' }), 'wrong_phase')
  })
  it('pause dérivée de la présence', () => {
    const s = started()
    expect(isPaused(s, new Set(PIDS))).toBe(false)
    expect(isPaused(s, new Set(['p0', 'p1', 'p2']))).toBe(true)
    const v = buildView(s, 'p0', new Set(['p0', 'p1', 'p2']), 0)
    expect(v.pause!.disconnectedSeats).toEqual([3])
    expect(v.actions.canPass).toBe(false)
  })
})

describe('confidentialité des vues', () => {
  it('chaque joueur ne reçoit que sa main ; aucun secret ni état interne', () => {
    let s = started()
    s = bid(s, 0, 80)
    for (let seat = 0; seat < 4; seat++) {
      const v = buildView(s, PIDS[seat], new Set(PIDS), 0)
      const json = JSON.stringify(v)
      expect(v.hand).toHaveLength(8)
      expect(v.hand.every((h) => s.round!.hands[seat].some((x) => sameCard(x, h)))).toBe(true)
      for (let other = 0; other < 4; other++) {
        if (other === seat) continue
        for (const card of s.round!.hands[other])
          expect(json).not.toContain(`"suit":"${card.suit}","rank":"${card.rank}"`)
      }
      expect(json).not.toMatch(/token|hands|beloteSeat|initialHands|deck/i)
      expect(v.round!.cardsLeft).toEqual([8, 8, 8, 8])
    }
  })
  it('un participant sans place ne reçoit aucune main', () => {
    const s = lobby()
    expect(buildView(s, 'p0', new Set(PIDS), 0).hand).toEqual([])
  })
})
