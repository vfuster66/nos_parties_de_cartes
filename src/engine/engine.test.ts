import { describe, expect, it } from 'vitest'
import { scoreBelote } from './belote'
import type { BeloteInput } from './belote'
import { scoreCoinche } from './coinche'
import type { CoincheInput } from './coinche'
import { computeGame, computeResult, recomputeDealers } from './game'
import type { Game } from './model'
import { roundTarotGap, roundToTenHalfUp } from './rounding'
import { participations, playerRanking, teamRanking } from './stats'
import { gapFromPoints, scoreTarot } from './tarot'
import type { TarotInput } from './tarot'
import { defaultRules, sum } from './types'
import type { BeloteRules, CoincheRules, TarotRules } from './types'

const R = defaultRules('coinche') as CoincheRules
const RE: CoincheRules = { ...R, rounding: 'exact' }
const co = (o: Partial<CoincheInput> = {}): CoincheInput => ({
  takerId: 'a',
  takerTeam: 0,
  contract: 100,
  trump: 'coeur',
  level: 'none',
  takerPoints: 112,
  allTricks: false,
  beloteTeam: null,
  ...o,
})
const sc = (i: CoincheInput, rules = R) => scoreCoinche(i, rules).delta

describe('arrondis', () => {
  it('coinche : dizaine la plus proche, 5 vers le haut', () => {
    expect(roundToTenHalfUp(84)).toBe(80)
    expect(roundToTenHalfUp(85)).toBe(90)
    expect(roundToTenHalfUp(112)).toBe(110)
  })
  it('tarot : jusqu’à 5 inclus vers le bas', () => {
    expect([0.5, 5, 5.5, 15, 15.5, 0].map(roundTarotGap)).toEqual([0, 0, 10, 10, 20, 0])
  })
})

describe('coinche', () => {
  it('contrat 100, plis 112/50', () => {
    expect(sc(co())).toEqual([210, 50])
    expect(sc(co(), RE)).toEqual([212, 50])
    expect(sc(co({ level: 'coinche' }))).toEqual([420, 50])
    expect(sc(co({ level: 'coinche' }), RE)).toEqual([424, 50])
    expect(sc(co({ level: 'surcoinche' }))).toEqual([630, 50])
    expect(sc(co({ level: 'surcoinche' }), RE)).toEqual([636, 50])
  })
  it('chutes', () => {
    expect(sc(co({ takerPoints: 90 }))).toEqual([0, 260])
    expect(sc(co({ takerPoints: 90 }), RE)).toEqual([0, 262])
    expect(sc(co({ takerPoints: 90, level: 'coinche' }))).toEqual([0, 520])
    expect(sc(co({ takerPoints: 90, level: 'coinche' }), RE)).toEqual([0, 524])
    expect(sc(co({ takerPoints: 90, level: 'surcoinche' }))).toEqual([0, 780])
    expect(sc(co({ takerPoints: 90, level: 'surcoinche' }), RE)).toEqual([0, 786])
  })
  it('atteindre le contrat suffit', () => {
    const d = scoreCoinche(co({ contract: 80, takerPoints: 80 }), R)
    expect(d.outcome).toBe('success')
  })
  it('la belote des preneurs peut les sauver', () => {
    const d = scoreCoinche(co({ contract: 80, takerPoints: 62, beloteTeam: 0 }), R)
    expect(d.outcome).toBe('success')
    expect(d.delta).toEqual([60 + 80 + 20, 100])
  })
  it('la belote adverse ne fait pas chuter les preneurs', () => {
    const d = scoreCoinche(co({ contract: 80, takerPoints: 82, beloteTeam: 1 }), R)
    expect(d.outcome).toBe('success')
    expect(d.delta[1]).toBe(80 + 20)
  })
  it('belote conservée en cas de chute, jamais multipliée', () => {
    expect(sc(co({ takerPoints: 70, level: 'coinche', beloteTeam: 0 }))).toEqual([20, 520])
    expect(sc(co({ takerPoints: 70, level: 'coinche', beloteTeam: 1 }))).toEqual([0, 540])
    expect(sc(co({ level: 'coinche', beloteTeam: 0 }))[0]).toBe(440)
  })
  it('capot', () => {
    expect(sc(co({ allTricks: true }))[0]).toBe(350)
    expect(sc(co({ allTricks: true, contract: 'capot' }))[0]).toBe(500)
    expect(sc(co({ contract: 'capot', takerPoints: 150 }))).toEqual([0, 410])
    expect(sc(co({ contract: 'capot', takerPoints: 150 }), RE)).toEqual([0, 412])
    expect(sc(co({ contract: 'capot', takerPoints: 150, level: 'coinche' }))[1]).toBe(820)
  })
  it('162 points sans capot déclaré est refusé ; capot annoncé chute avec un pli concédé', () => {
    expect(() => scoreCoinche(co({ takerPoints: 162 }), R)).toThrow()
    expect(scoreCoinche(co({ contract: 'capot', takerPoints: 140 }), R).outcome).toBe('fail')
  })
  it('allowFullPoints (jeu en ligne) : 162 points sans les huit plis ne sont jamais un capot', () => {
    const on = { allowFullPoints: true }
    // Sans l'option (compteur manuel) : refus conservé, y compris sur chaque appelant par défaut.
    expect(() => scoreCoinche(co({ takerPoints: 162 }), R, {})).toThrow(/162 points/)
    expect(() => scoreCoinche(co({ takerPoints: 162 }), R, { allowFullPoints: false })).toThrow()
    const d = scoreCoinche(co({ takerPoints: 162 }), R, on)
    expect(d.outcome).toBe('success') // et non 'capot'
    expect(d.delta).toEqual([160 + 100, 0]) // plis arrondis 162 → 160, contrat 100, aucun bonus de capot
    expect(scoreCoinche(co({ takerPoints: 162 }), RE, on).delta).toEqual([162 + 100, 0])
    expect(scoreCoinche(co({ takerPoints: 162, level: 'coinche', coincheTeam: 1 }), R, on).delta).toEqual([520, 0])
    // Capot annoncé avec 162 points mais un pli concédé : chute.
    expect(scoreCoinche(co({ contract: 'capot', takerPoints: 162 }), R, on)).toMatchObject({
      outcome: 'fail',
      delta: [0, 410],
    })
    // Les huit plis restent le seul critère du capot ; les autres validations ne sont pas assouplies.
    expect(scoreCoinche(co({ allTricks: true }), R, on).outcome).toBe('capot')
    expect(() => scoreCoinche(co({ takerPoints: 163 }), R, on)).toThrow()
    expect(() => scoreCoinche(co({ takerPoints: -1 }), R, on)).toThrow()
    expect(() => scoreCoinche(co({ contract: 95 }), R, on)).toThrow()
  })
  it('contrat atteint exactement, belote qui sauve, arrondis sur les plis exacts', () => {
    expect(scoreCoinche(co({ contract: 90, takerPoints: 90 }), R).outcome).toBe('success')
    expect(scoreCoinche(co({ contract: 90, takerPoints: 89 }), R).outcome).toBe('fail')
    expect(scoreCoinche(co({ contract: 90, takerPoints: 70, beloteTeam: 0 }), R).outcome).toBe('success')
    expect(scoreCoinche(co({ contract: 90, takerPoints: 69, beloteTeam: 0 }), R).outcome).toBe('fail')
    // 85 → 90 et 77 → 80 (défense), jugés sur 85 exacts ≥ 80.
    expect(sc(co({ contract: 80, takerPoints: 85 }))).toEqual([90 + 80, 80])
  })
  it('validations', () => {
    expect(() => scoreCoinche(co({ takerPoints: -1 }), R)).toThrow()
    expect(() => scoreCoinche(co({ takerPoints: 163 }), R)).toThrow()
    expect(() => scoreCoinche(co({ contract: 95 }), R)).toThrow()
    expect(() => scoreCoinche(co({ takerPoints: NaN }), R)).toThrow()
  })
})

const BR = defaultRules('belote') as BeloteRules
const bel = (o: Partial<BeloteInput> = {}): BeloteInput => ({
  takerId: 'a',
  takerTeam: 0,
  trump: 'pique',
  takerPoints: 90,
  capotTeam: null,
  announcements: [{}, {}],
  strongest: null,
  beloteTeam: null,
  ...o,
})

describe('belote', () => {
  it('90 contre 72 + belote : chute, la défense reçoit tout', () => {
    const d = scoreBelote(bel({ beloteTeam: 1 }), BR)
    expect(d.outcome).toBe('fail')
    expect(d.delta).toEqual([0, 160 + 20])
  })
  it('comparaison sur les points exacts avant arrondi', () => {
    // 84 vs 78 : arrondis 80/80 mais les preneurs gagnent
    const d = scoreBelote(bel({ takerPoints: 84 }), BR)
    expect(d.outcome).toBe('success')
    expect(d.delta).toEqual([80, 80])
  })
  it('belote transférée à la défense en cas de chute (belote des preneurs)', () => {
    const d = scoreBelote(bel({ takerPoints: 60, beloteTeam: 0 }), BR)
    expect(d.outcome).toBe('fail')
    expect(d.delta).toEqual([0, 180])
  })
  it('annonces : sauvent ou font chuter', () => {
    const save = scoreBelote(bel({ takerPoints: 70, announcements: [{ cinquante: 1 }, {}] }), BR)
    expect(save.outcome).toBe('success')
    expect(save.delta).toEqual([70 + 50, 90])
    const sink = scoreBelote(bel({ takerPoints: 90, announcements: [{}, { cent: 1 }] }), BR)
    expect(sink.outcome).toBe('fail')
    expect(sink.delta).toEqual([0, 160 + 100])
  })
  it('plus forte annonce : l’autre est éliminée, jamais réintroduite en cas de chute', () => {
    const d = scoreBelote(bel({ takerPoints: 70, announcements: [{ tierce: 1 }, { cinquante: 1 }], strongest: 1 }), BR)
    expect(d.teams[0].annonces).toBe(0)
    expect(d.teams[1].annonces).toBe(50)
    expect(d.outcome).toBe('fail') // 70 vs 92+50
    expect(d.delta).toEqual([0, 160 + 50])
  })
  it('égalité des plus fortes annonces : elles s’annulent', () => {
    const d = scoreBelote(
      bel({ takerPoints: 100, announcements: [{ tierce: 1 }, { tierce: 1 }], strongest: 'tie' }),
      BR,
    )
    expect(d.teams[0].annonces + d.teams[1].annonces).toBe(0)
  })
  it('exige un choix explicite si les deux équipes ont des annonces', () => {
    expect(() => scoreBelote(bel({ announcements: [{ tierce: 1 }, { tierce: 1 }] }), BR)).toThrow()
  })
  it('capot : chacun conserve annonces validées et belote', () => {
    const d = scoreBelote(bel({ capotTeam: 1, announcements: [{ cinquante: 1 }, {}], strongest: 0, beloteTeam: 0 }), BR)
    expect(d.outcome).toBe('capot')
    expect(d.delta).toEqual([50 + 20, 250])
  })
  it('litige sans annonces : 81/81', () => {
    const d = scoreBelote(bel({ takerPoints: 81 }), BR)
    expect(d.outcome).toBe('litige')
    expect(d.delta).toEqual([0, 80])
    expect(d.reserveCreated?.total).toBe(80)
  })
  it('litige par compensation : 81 + tierce contre 81 + belote', () => {
    const d = scoreBelote(bel({ takerPoints: 81, announcements: [{ tierce: 1 }, {}], beloteTeam: 1 }), BR)
    expect(d.outcome).toBe('litige')
    expect(d.reserveCreated).toEqual({ plis: 80, annonces: 20, belote: 0, total: 100 })
    expect(d.delta).toEqual([0, 100])
  })
  it('mode réel', () => {
    const d = scoreBelote(bel({ takerPoints: 100 }), { ...BR, rounding: 'exact' })
    expect(d.delta).toEqual([100, 62])
  })
})

const mkGame = (kind: 'coinche' | 'belote' | 'tarot', n = 4, over: Partial<Game> = {}): Game => ({
  id: 'g1',
  kind,
  autoName: 'x',
  eveningId: null,
  startedAt: '',
  endedAt: null,
  status: 'in_progress',
  playerIds: ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n),
  teamIds: kind === 'tarot' ? null : ['t1', 't2'],
  firstDealerId: 'a',
  rules: defaultRules(kind),
  deals: [],
  ...over,
})
let seq = 0
const deal = (dealerId: string, input: Game['deals'][number]['input'], passed = false) => ({
  id: `d${++seq}`,
  dealerId,
  passed,
  input,
  createdAt: '',
})

describe('réserve de litige (belote)', () => {
  it('plusieurs litiges cumulent et la prochaine donne décisive attribue', () => {
    const g = mkGame('belote')
    g.deals = [
      deal('a', bel({ takerPoints: 81 })),
      deal('b', bel({ takerPoints: 81 })),
      deal('c', null, true), // donne passée : n'attribue pas
      deal('d', bel({ takerPoints: 100 })), // réussie : les preneurs (équipe 0) gagnent la réserve
    ]
    const s = computeGame(g)
    expect(s.rows[1].reserveAfter).toHaveLength(2)
    expect(s.rows[2].reserveAfter).toHaveLength(2)
    expect(s.rows[3].reserveAwarded).toHaveLength(2)
    expect(s.rows[3].reserveWinner).toBe(0)
    // 80+80 (défense), puis 100 + 160 de réserve pour l'équipe 0
    expect(s.totals).toEqual([100 + 160, 80 + 80 + 60])
    expect(s.reserve).toHaveLength(0)
  })
  it('recalcul après suppression d’une donne', () => {
    const g = mkGame('belote')
    g.deals = [deal('a', bel({ takerPoints: 81 })), deal('b', bel({ takerPoints: 100 }))]
    expect(computeGame(g).totals).toEqual([100 + 80, 80 + 60])
    g.deals = g.deals.slice(1)
    expect(computeGame(g).totals).toEqual([100, 60])
  })
  it('la défense gagne la prochaine donne : elle reçoit la réserve', () => {
    const g = mkGame('belote')
    g.deals = [deal('a', bel({ takerPoints: 81 })), deal('b', bel({ takerPoints: 60 }))]
    const s = computeGame(g)
    expect(s.rows[1].reserveWinner).toBe(1)
    expect(s.totals[1]).toBe(80 + 160 + 80)
  })
})

describe('fin de partie', () => {
  it('évaluée à la fin de la donne, plus haut total gagne, égalité poursuit', () => {
    const g = mkGame('coinche')
    ;(g.rules as CoincheRules).target = 300
    g.deals = [deal('a', co()), deal('b', co())] // 210 + 210 = 420 vs 100
    const s = computeGame(g)
    expect(s.totals).toEqual([420, 100])
    expect(s.endReached).toBe(true)
    expect(computeResult(g).winners).toEqual([0])
    g.deals = [deal('a', co({ contract: 80, takerPoints: 80 })), deal('b', co({ takerPoints: 90 }))]
    // 140+... on construit une égalité : 0/260 vs ... simple vérification d'égalité directe
    const tie = {
      ...g,
      rules: { ...g.rules, target: 100 } as CoincheRules,
      deals: [deal('a', co({ contract: 80, takerPoints: 81 }))],
    }
    expect(computeGame(tie).totals).toEqual([160, 80])
  })
  it('rotation du donneur et recalcul explicite', () => {
    const g = mkGame('coinche')
    g.deals = [deal('a', co()), deal('b', co()), deal('c', co())]
    expect(computeGame(g).nextDealerId).toBe('d')
    g.deals = g.deals.slice(1) // suppression : donneurs conservés
    expect(g.deals.map((d) => d.dealerId)).toEqual(['b', 'c'])
    expect(recomputeDealers(g).deals.map((d) => d.dealerId)).toEqual(['a', 'b'])
  })
})

const TR = defaultRules('tarot') as TarotRules
const ids = (n: number) => ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n)
const ta = (o: Partial<TarotInput> = {}): TarotInput => ({
  takerId: 'a',
  contract: 'garde',
  gap: 5,
  success: true,
  calledId: null,
  aloneReason: null,
  bonuses: [],
  ...o,
})
const tarot = (i: TarotInput, n = 4, dealer = 'a') => scoreTarot(i, { playerIds: ids(n), dealerId: dealer }, TR)

describe('tarot', () => {
  it('valeurs V', () => {
    expect(tarot(ta()).value).toBe(80)
    expect(tarot(ta({ gap: 5.5 })).value).toBe(90)
    expect(tarot(ta({ contract: 'pousse', gap: 0.5, success: false })).value).toBe(-40)
    expect(tarot(ta({ gap: 5.5, success: false })).value).toBe(-90)
    expect(tarot(ta({ gap: 15 })).roundedGap).toBe(10)
    expect(tarot(ta({ gap: 15.5 })).roundedGap).toBe(20)
  })
  it('écart nul : réussi', () => {
    const d = tarot(ta({ gap: 0, success: false }))
    expect(d.outcome).toBe('success')
    expect(d.value).toBe(80)
  })
  it('répartitions 3, 4, 5 actifs', () => {
    expect(tarot(ta(), 3).delta).toEqual([160, -80, -80])
    expect(tarot(ta(), 4).delta).toEqual([240, -80, -80, -80])
    expect(tarot(ta({ calledId: 'c' }), 5).delta).toEqual([160, -80, 80, -80, -80])
    expect(tarot(ta({ aloneReason: 'self_call' }), 5).delta).toEqual([320, -80, -80, -80, -80])
    expect(tarot(ta({ aloneReason: 'king_in_dog' }), 5).delta).toEqual([320, -80, -80, -80, -80])
    expect(tarot(ta({ success: false, aloneReason: 'self_call' }), 5).delta).toEqual([-320, 80, 80, 80, 80])
  })
  it('primes', () => {
    const b = (type: TarotInput['bonuses'][number]['type'], playerId: string, extra = {}) => ({
      type,
      playerId,
      ...extra,
    })
    const base = { contract: 'pousse' as const, gap: 0, aloneReason: 'self_call' as const }
    expect(tarot(ta({ ...base, bonuses: [b('petitAuBout', 'b')] }), 4).bonuses[0].delta).toEqual([-10, 30, -10, -10])
    expect(tarot(ta({ ...base, bonuses: [b('poigneDouble', 'b')] }), 5).bonuses[0].delta).toEqual([
      -20, 80, -20, -20, -20,
    ])
    expect(tarot(ta({ ...base, bonuses: [b('petitChelem', 'b', { tricksConceded: 5 })] }), 5).bonuses[0].delta).toEqual(
      [10, -40, 10, 10, 10],
    )
    expect(tarot(ta({ ...base, bonuses: [b('grandChelem', 'b', { tricksConceded: 1 })] }), 5).bonuses[0].delta).toEqual(
      [20, -80, 20, 20, 20],
    )
    expect(
      tarot(ta({ ...base, bonuses: [b('petitChelem', 'b', { tricksConceded: 3 })] }), 5).bonuses[0].succeeded,
    ).toBe(true)
    expect(tarot(ta({ ...base, bonuses: [b('blancTete', 'a')] }), 3).bonuses[0].delta).toEqual([20, -10, -10])
  })
  it('plusieurs primes, conservées malgré la chute, somme nulle', () => {
    const d = tarot(
      ta({
        success: false,
        gap: 10,
        bonuses: [
          { type: 'petitAuBout', playerId: 'a' },
          { type: 'poigneSimple', playerId: 'c' },
        ],
      }),
      4,
    )
    expect(d.outcome).toBe('fail')
    expect(sum(d.delta)).toBe(0)
    expect(d.bonuses[0].delta[0]).toBe(30)
    expect(d.contractDelta).toEqual([-270, 90, 90, 90])
  })
  it('six inscrits : donneur au repos exclu', () => {
    const d = tarot(ta({ takerId: 'b', calledId: 'c', bonuses: [{ type: 'petitAuBout', playerId: 'b' }] }), 6, 'a')
    expect(d.delta[0]).toBe(0)
    expect(sum(d.delta)).toBe(0)
    expect(d.bonuses[0].delta[0]).toBe(0)
    expect(() => tarot(ta({ takerId: 'a', calledId: 'c' }), 6, 'a')).toThrow()
    expect(() => tarot(ta({ takerId: 'b', calledId: 'a' }), 6, 'a')).toThrow()
    expect(() =>
      tarot(ta({ takerId: 'b', calledId: 'c', bonuses: [{ type: 'blancTete', playerId: 'a' }] }), 6, 'a'),
    ).toThrow()
  })
  it('appelé identique au preneur refusé ; cinq joueurs exigent un appel', () => {
    expect(() => tarot(ta({ calledId: 'a' }), 5)).toThrow()
    expect(() => tarot(ta(), 5)).toThrow()
  })
  it('aide de saisie', () => {
    expect(gapFromPoints(51, 1)).toEqual({ gap: 0, success: true })
    expect(gapFromPoints(30.5, 2)).toEqual({ gap: 10.5, success: false })
  })
})

describe('tarot : fin de partie et classement', () => {
  it('seuil évalué après primes, premiers ex æquo', () => {
    const g = mkGame('tarot', 3, { rules: { ...TR, endMode: 'threshold', threshold: 100 } })
    g.deals = [deal('a', ta({ contract: 'pousse', gap: 0 }))] // 40 → preneur +80
    expect(computeGame(g).endReached).toBe(false)
    g.deals.push(
      deal('b', ta({ takerId: 'a', contract: 'pousse', gap: 0, bonuses: [{ type: 'poigneTriple', playerId: 'a' }] })),
    )
    const s = computeGame(g)
    expect(s.totals).toEqual([80 + 80 + 60, -40 - 40 - 30, -40 - 40 - 30])
    expect(s.endReached).toBe(true)
    const r = computeResult(g, [50, 50, -100])
    expect(r.winners).toEqual([0, 1])
    expect(r.ranking[2].rank).toBe(3)
  })
})

describe('statistiques', () => {
  const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), createdAt: '' }))
  const teams = [
    { id: 't1', memberIds: ['a', 'c'] as [string, string], createdAt: '' },
    { id: 't2', memberIds: ['b', 'd'] as [string, string], createdAt: '' },
  ]
  it('victoires d’équipe attribuées aux deux joueurs ; abandonnées exclues', () => {
    const fin = mkGame('coinche', 4, { id: 'g1', status: 'finished' })
    fin.deals = [deal('a', co())]
    const aband = mkGame('coinche', 4, { id: 'g2', status: 'abandoned' })
    aband.deals = [deal('a', co())]
    const data = { players, teams, games: [fin, aband] }
    expect(participations(aband)).toEqual([])
    const pr = playerRanking(data, 'coinche')
    expect(pr.find((r) => r.id === 'a')?.tally.wins).toBe(1)
    expect(pr.find((r) => r.id === 'c')?.tally.wins).toBe(1)
    expect(pr.find((r) => r.id === 'b')?.tally.losses).toBe(1)
    expect(pr[0].rank).toBe(1)
    expect(pr[1].rank).toBe(1)
    expect(teamRanking(data, 'coinche')[0].name).toBe('A & C')
    expect(pr.find((r) => r.id === 'a')?.tally.takeSuccess).toBe(1)
  })
  it('tarot : premiers ex æquo gagnent tous', () => {
    const g = mkGame('tarot', 4, { status: 'finished' })
    g.deals = [deal('a', ta({ gap: 0 })), deal('a', ta({ takerId: 'b', success: false, gap: 0 }))]
    // gap 0 => réussi pour les deux : a +240, b +240 → égalité en tête
    const data = { players, teams: [], games: [g] }
    const pr = playerRanking(data, 'tarot')
    expect(
      pr
        .filter((r) => r.tally.wins === 1)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['a', 'b'])
  })
  it('recalcul après correction d’une partie terminée', () => {
    const g = mkGame('coinche', 4, { status: 'finished' })
    g.deals = [deal('a', co())]
    expect(participations(g).find((p) => p.teamId === 't1')?.result).toBe('win')
    g.deals = [deal('a', co({ takerPoints: 60 }))]
    expect(participations(g).find((p) => p.teamId === 't1')?.result).toBe('loss')
  })
})
