// Moteur d'une salle de coinche en ligne : applique des commandes à un état (pur, déterministe).
// `applyCommand` ne modifie jamais l'état reçu : il renvoie un nouvel état ou lève une RuleError.
import { scoreCoinche } from '../../src/engine/coinche'
import type { CoincheInput } from '../../src/engine/coinche'
import type { Command } from '../protocol'
import { VERSIONED } from '../protocol'
import {
  cardPoints,
  dealHands,
  hasBelote,
  LAST_TRICK_BONUS,
  nextSeat,
  sameCard,
  shuffleDeck,
  teamOf,
  trickWinner,
} from './cards'
import type { Card, Seat, TeamIdx } from './cards'
import { legalCards } from './rules'
import { MAX_BID, MIN_BID, RuleError, SURCOINCHE_WINDOW_MS } from './types'
import type { BidEntry, Config, MatchState, Participant, RoundRecord, RoundState } from './types'

export interface Ctx {
  now: number
  /** Vrai si un joueur assis est déconnecté (partie en pause). Fourni par le serveur. */
  paused: boolean
  /** Entier uniforme dans [0, n). Injecté : cryptographique en production, déterministe seulement en test. */
  randomInt: (n: number) => number
}

export const MAX_PARTICIPANTS = 4

export function defaultConfig(): Config {
  return { gameName: '', teamNames: ['Équipe 1', 'Équipe 2'], rounding: 'rounded', target: 3000, firstDealer: 'random' }
}

export function newMatch(id: string, code: string, host: Participant, now: number): MatchState {
  return {
    schema: 1,
    id,
    code,
    version: 1,
    createdAt: now,
    startedAt: null,
    endedAt: null,
    status: 'lobby',
    hostId: host.id,
    participants: [host],
    seats: [null, null, null, null],
    readyIds: [],
    config: defaultConfig(),
    totals: [0, 0],
    round: null,
    rounds: [],
    result: null,
  }
}

const clone = <T>(x: T): T => structuredClone(x)
const bump = (s: MatchState): MatchState => {
  s.version += 1
  return s
}
const fail = (code: ConstructorParameters<typeof RuleError>[0], msg: string): never => {
  throw new RuleError(code, msg)
}
export const seatOf = (s: MatchState, pid: string): Seat | null => {
  const i = s.seats.indexOf(pid)
  return i < 0 ? null : (i as Seat)
}
const requireParticipant = (s: MatchState, pid: string): Participant =>
  s.participants.find((p) => p.id === pid) ?? fail('forbidden', "Vous ne faites pas partie de ce salon.")

// ---------- Participants (hors commandes : appelés par le serveur) ----------

export function addParticipant(state: MatchState, p: Participant): MatchState {
  if (state.status !== 'lobby') fail('wrong_phase', 'La partie a déjà commencé : aucune nouvelle personne ne peut entrer.')
  if (state.participants.length >= MAX_PARTICIPANTS) fail('full', 'Le salon est complet (4 personnes).')
  if (state.participants.some((x) => x.nickname.toLowerCase() === p.nickname.toLowerCase()))
    fail('conflict', 'Ce pseudo est déjà pris dans le salon.')
  const s = clone(state)
  s.participants.push(p)
  return bump(s)
}

/** Retire une personne du salon avant le début. L'hôte est transféré si besoin (`connected` : ids en ligne). */
export function removeParticipant(state: MatchState, pid: string, connected: ReadonlySet<string>): MatchState {
  if (state.status !== 'lobby') fail('wrong_phase', 'Impossible de quitter une partie commencée.')
  const s = clone(state)
  s.participants = s.participants.filter((p) => p.id !== pid)
  s.seats = s.seats.map((x) => (x === pid ? null : x))
  s.readyIds = s.readyIds.filter((x) => x !== pid)
  if (s.hostId === pid) s.hostId = (s.participants.find((p) => connected.has(p.id)) ?? s.participants[0])?.id ?? s.hostId
  return bump(s)
}

/** Si l'hôte n'est pas connecté, confie le rôle à un participant connecté (aucun pouvoir sur cartes ou scores). */
export function ensureHost(state: MatchState, connected: ReadonlySet<string>): MatchState {
  if (connected.has(state.hostId)) return state
  const next = state.participants.find((p) => connected.has(p.id))
  if (!next) return state
  const s = clone(state)
  s.hostId = next.id
  return bump(s)
}

/** Vrai si une personne assise est déconnectée (la partie en cours est alors en pause). */
export const isPaused = (state: MatchState, connected: ReadonlySet<string>): boolean =>
  (state.status === 'playing' || state.status === 'lobby') && state.seats.some((pid) => pid != null && !connected.has(pid))

// ---------- Temps de la fenêtre de surcoinche ----------

export function pauseWindow(state: MatchState, now: number): MatchState {
  const w = state.round?.window
  if (!w || w.deadlineAt == null) return state
  const s = clone(state)
  const sw = s.round!.window!
  sw.remainingMs = Math.max(0, sw.deadlineAt! - now)
  sw.deadlineAt = null
  return bump(s)
}

export function resumeWindow(state: MatchState, now: number): MatchState {
  const w = state.round?.window
  if (!w || w.deadlineAt != null) return state
  const s = clone(state)
  const sw = s.round!.window!
  sw.deadlineAt = now + sw.remainingMs
  return bump(s)
}

/** Si l'échéance est passée, le contrat reste coinché et le jeu commence. */
export function expireWindow(state: MatchState, now: number): MatchState {
  const r = state.round
  if (!r || r.phase !== 'window' || !r.window || r.window.deadlineAt == null || now < r.window.deadlineAt) return state
  const s = clone(state)
  startPlay(s.round!)
  return bump(s)
}

// ---------- Donnes ----------

function startRound(s: MatchState, dealer: Seat, randomInt: (n: number) => number): void {
  const hands = dealHands(shuffleDeck(randomInt))
  s.round = {
    index: s.rounds.length,
    dealer,
    phase: 'bidding',
    hands,
    beloteSeat: null,
    bids: [],
    turn: nextSeat(dealer),
    consecutivePasses: 0,
    contract: null,
    level: 'none',
    coincheSeat: null,
    window: null,
    trick: [],
    tricks: [],
    beloteEvents: [],
    readyForNext: [],
  }
}

function startPlay(r: RoundState): void {
  const c = r.contract!
  r.phase = 'playing'
  r.window = null
  r.beloteSeat = ([0, 1, 2, 3] as Seat[]).find((seat) => hasBelote(r.hands[seat], c.suit)) ?? null
  r.turn = nextSeat(r.dealer) // à gauche du donneur, quel que soit le preneur
  r.trick = []
}

function passedRound(s: MatchState, randomInt: (n: number) => number): void {
  const r = s.round!
  s.rounds.push({
    index: r.index,
    dealer: r.dealer,
    passed: true,
    bids: r.bids,
    contract: null,
    level: 'none',
    coincheTeam: null,
    takerTeam: null,
    trickCounts: [0, 0],
    trickPoints: [0, 0],
    beloteTeam: null,
    tricks: [],
    detail: null,
    delta: [0, 0],
    totalsAfter: [...s.totals],
  })
  startRound(s, nextSeat(r.dealer), randomInt)
}

/** Fin d'une partie : le plus grand total gagne dès qu'une équipe atteint l'objectif ; égalité → donne de plus. */
export function matchWinner(totals: readonly [number, number], target: number): TeamIdx | null {
  if (Math.max(totals[0], totals[1]) < target || totals[0] === totals[1]) return null
  return totals[0] > totals[1] ? 0 : 1
}

function endRound(s: MatchState, now: number): void {
  const r = s.round!
  const c = r.contract!
  const takerTeam = teamOf(c.seat)
  const pts: [number, number] = [0, 0]
  const counts: [number, number] = [0, 0]
  r.tricks.forEach((t, i) => {
    const team = teamOf(t.winner)
    counts[team] += 1
    pts[team] += t.cards.reduce((sum, x) => sum + cardPoints(x.card, c.suit), 0) + (i === 7 ? LAST_TRICK_BONUS : 0)
  })
  const beloteTeam = r.beloteSeat == null ? null : teamOf(r.beloteSeat)
  const coincheTeam: TeamIdx | null = r.level === 'none' ? null : ((1 - takerTeam) as TeamIdx)
  const input: CoincheInput = {
    takerId: `place-${c.seat}`,
    takerTeam,
    contract: c.value,
    trump: c.suit,
    level: r.level,
    coincheTeam,
    takerPoints: pts[takerTeam],
    allTricks: counts[takerTeam] === 8, // capot = huit plis réellement remportés, jamais déduit des points
    beloteTeam,
  }
  const detail = scoreCoinche(input, { kind: 'coinche', rounding: s.config.rounding, target: s.config.target }, { allowFullPoints: true })
  s.totals = [s.totals[0] + detail.delta[0], s.totals[1] + detail.delta[1]]
  const record: RoundRecord = {
    index: r.index,
    dealer: r.dealer,
    passed: false,
    bids: r.bids,
    contract: c,
    level: r.level,
    coincheTeam,
    takerTeam,
    trickCounts: counts,
    trickPoints: pts,
    beloteTeam,
    tricks: r.tricks,
    detail,
    delta: detail.delta,
    totalsAfter: [...s.totals],
  }
  s.rounds.push(record)
  r.phase = 'summary'
  r.turn = null
  r.readyForNext = []
  const winner = matchWinner(s.totals, s.config.target)
  if (winner != null) {
    s.status = 'finished'
    s.endedAt = now
    s.result = { winnerTeam: winner, totals: [...s.totals] }
  }
}

// ---------- Commandes ----------

/** Applique une commande d'un participant. Lève RuleError si elle est refusée ; l'état d'origine reste intact. */
export function applyCommand(state: MatchState, actorId: string, cmd: Command, ctx: Ctx): MatchState {
  requireParticipant(state, actorId)
  if (state.status === 'finished' || state.status === 'abandoned')
    fail('wrong_phase', state.status === 'finished' ? 'La partie est terminée.' : 'La partie a été abandonnée.')
  if (VERSIONED.has(cmd.type) && cmd.expectedVersion !== state.version)
    fail('stale', "L'état de la partie a changé : votre action est périmée. Vérifiez l'écran et recommencez.")

  const s = clone(state)
  const isLobby = s.status === 'lobby'
  const lobbyOnly = (): void => {
    if (!isLobby) fail('wrong_phase', 'Action possible seulement avant le début de la partie.')
  }
  const hostOnly = (): void => {
    if (s.hostId !== actorId) fail('forbidden', "Seul l'hôte peut faire cela.")
  }
  const seat = seatOf(s, actorId)

  switch (cmd.type) {
    case 'takeSeat': {
      lobbyOnly()
      if (s.seats[cmd.seat] && s.seats[cmd.seat] !== actorId) fail('conflict', 'Cette place est déjà prise.')
      s.seats = s.seats.map((x) => (x === actorId ? null : x))
      s.seats[cmd.seat] = actorId
      s.readyIds = s.readyIds.filter((x) => x !== actorId)
      break
    }
    case 'leaveSeat': {
      lobbyOnly()
      s.seats = s.seats.map((x) => (x === actorId ? null : x))
      s.readyIds = s.readyIds.filter((x) => x !== actorId)
      break
    }
    case 'assignSeat': {
      lobbyOnly()
      hostOnly()
      if (!s.participants.some((p) => p.id === cmd.participantId)) fail('not_found', 'Participant inconnu.')
      if (cmd.seat != null && s.seats[cmd.seat] && s.seats[cmd.seat] !== cmd.participantId)
        fail('conflict', 'Cette place est déjà prise.')
      s.seats = s.seats.map((x) => (x === cmd.participantId ? null : x))
      if (cmd.seat != null) s.seats[cmd.seat] = cmd.participantId
      s.readyIds = s.readyIds.filter((x) => x !== cmd.participantId)
      break
    }
    case 'kick': {
      lobbyOnly()
      hostOnly()
      if (cmd.participantId === actorId) fail('invalid', 'Vous ne pouvez pas vous retirer vous-même.')
      if (!s.participants.some((p) => p.id === cmd.participantId)) fail('not_found', 'Participant inconnu.')
      s.participants = s.participants.filter((p) => p.id !== cmd.participantId)
      s.seats = s.seats.map((x) => (x === cmd.participantId ? null : x))
      s.readyIds = s.readyIds.filter((x) => x !== cmd.participantId)
      break
    }
    case 'setReady': {
      lobbyOnly()
      if (seat == null) fail('forbidden', 'Choisissez une place avant de vous déclarer prêt.')
      s.readyIds = s.readyIds.filter((x) => x !== actorId)
      if (cmd.ready) s.readyIds.push(actorId)
      break
    }
    case 'leaveRoom': {
      lobbyOnly()
      if (s.participants.length === 1) fail('invalid', "Vous êtes seul : abandonnez la partie pour fermer le salon.")
      s.participants = s.participants.filter((p) => p.id !== actorId)
      s.seats = s.seats.map((x) => (x === actorId ? null : x))
      s.readyIds = s.readyIds.filter((x) => x !== actorId)
      if (s.hostId === actorId) s.hostId = s.participants[0].id // ajusté ensuite par le serveur selon la présence
      break
    }
    case 'configure': {
      lobbyOnly()
      hostOnly()
      if (cmd.gameName !== undefined) s.config.gameName = cmd.gameName
      if (cmd.teamNames) s.config.teamNames = cmd.teamNames
      if (cmd.rounding) s.config.rounding = cmd.rounding
      if (cmd.target) s.config.target = cmd.target
      if (cmd.firstDealer !== undefined) s.config.firstDealer = cmd.firstDealer
      s.readyIds = [] // tout le monde revalide les règles
      break
    }
    case 'start': {
      lobbyOnly()
      hostOnly()
      if (ctx.paused) fail('paused', "Un joueur est déconnecté.")
      if (s.seats.some((x) => x == null)) fail('invalid', 'Les quatre places doivent être occupées.')
      if (!s.seats.every((x) => s.readyIds.includes(x!))) fail('invalid', 'Les quatre joueurs doivent être prêts.')
      const first: Seat = s.config.firstDealer === 'random' ? (ctx.randomInt(4) as Seat) : s.config.firstDealer
      s.status = 'playing'
      s.startedAt = ctx.now
      s.readyIds = []
      startRound(s, first, ctx.randomInt)
      break
    }
    case 'abandon': {
      hostOnly()
      s.status = 'abandoned'
      s.endedAt = ctx.now
      s.result = { winnerTeam: null, totals: [...s.totals] }
      break
    }
    default:
      gameCommand(s, seat, cmd, ctx)
  }
  return bump(s)
}

function gameCommand(s: MatchState, seat: Seat | null, cmd: Command, ctx: Ctx): void {
  if (s.status !== 'playing' || !s.round) fail('wrong_phase', "La partie n'a pas commencé.")
  if (seat == null) fail('forbidden', "Vous n'avez pas de place à la table.")
  if (ctx.paused) fail('paused', 'Partie en pause : un joueur est déconnecté.')
  const me = seat as Seat
  const r = s.round!

  // Une surcoinche arrivée après l'échéance est refusée (le serveur ferme la fenêtre via expireWindow).
  const windowClosed = r.phase === 'window' && r.window?.deadlineAt != null && ctx.now >= r.window.deadlineAt

  switch (cmd.type) {
    case 'pass':
    case 'bid':
    case 'capot': {
      if (r.phase !== 'bidding') fail('wrong_phase', 'Les enchères sont terminées.')
      if (r.turn !== me) fail('not_your_turn', "Ce n'est pas votre tour de parler.")
      handleBidding(s, r, me, cmd, ctx)
      break
    }
    case 'coinche': {
      if (r.phase !== 'bidding' || !r.contract) fail('wrong_phase', 'Les enchères sont fermées : on ne peut plus coincher.')
      if (r.contract!.bidIndex !== cmd.contractRef)
        fail('stale_contract', 'Le contrat a changé : votre coinche visait une enchère précédente.')
      if (teamOf(me) === teamOf(r.contract!.seat)) fail('forbidden', 'Vous ne pouvez pas coincher votre propre équipe.')
      r.bids.push({ kind: 'coinche', seat: me, contractRef: cmd.contractRef })
      r.level = 'coinche'
      r.coincheSeat = me
      r.phase = 'window'
      r.turn = null
      r.window = { remainingMs: SURCOINCHE_WINDOW_MS, deadlineAt: ctx.now + SURCOINCHE_WINDOW_MS, acceptedSeats: [] }
      break
    }
    case 'surcoinche': {
      if (r.phase !== 'window') fail('wrong_phase', "Il n'y a pas de coinche à surcoincher.")
      if (windowClosed) fail('window_closed', 'Le délai de surcoinche est écoulé.')
      if (teamOf(me) !== teamOf(r.contract!.seat)) fail('forbidden', "Seule l'équipe preneuse peut surcoincher.")
      r.bids.push({ kind: 'surcoinche', seat: me })
      r.level = 'surcoinche'
      startPlay(r)
      break
    }
    case 'acceptCoinche': {
      if (r.phase !== 'window') fail('wrong_phase', "Il n'y a pas de coinche à accepter.")
      if (windowClosed) fail('window_closed', 'Le délai de surcoinche est écoulé.')
      if (teamOf(me) !== teamOf(r.contract!.seat)) fail('forbidden', "Seule l'équipe preneuse peut accepter la coinche.")
      if (r.window!.acceptedSeats.includes(me)) fail('conflict', 'Vous avez déjà accepté la coinche.')
      r.window!.acceptedSeats.push(me)
      r.bids.push({ kind: 'accept', seat: me })
      if (r.window!.acceptedSeats.length === 2) startPlay(r)
      break
    }
    case 'playCard': {
      if (r.phase !== 'playing') fail('wrong_phase', "Ce n'est pas la phase de jeu des cartes.")
      if (r.turn !== me) fail('not_your_turn', "Ce n'est pas votre tour de jouer.")
      playCard(s, r, me, cmd.card, ctx.now)
      break
    }
    case 'nextRound': {
      if (r.phase !== 'summary') fail('wrong_phase', "La donne n'est pas terminée.")
      if (s.status !== 'playing') fail('wrong_phase', 'La partie est terminée.')
      if (!r.readyForNext.includes(me)) r.readyForNext.push(me)
      if (r.readyForNext.length === 4) startRound(s, nextSeat(r.dealer), ctx.randomInt)
      break
    }
    default:
      fail('invalid', 'Commande inconnue.')
  }
}

function handleBidding(
  s: MatchState,
  r: RoundState,
  me: Seat,
  cmd: Extract<Command, { type: 'pass' | 'bid' | 'capot' }>,
  ctx: Ctx,
): void {
  const cur = r.contract
  if (cmd.type === 'pass') {
    r.bids.push({ kind: 'pass', seat: me })
    r.consecutivePasses += 1
    if (cur && r.consecutivePasses >= 3) {
      startPlay(r) // trois passes consécutives : contrat validé
    } else if (!cur && r.consecutivePasses >= 4) {
      passedRound(s, ctx.randomInt) // quatre passes : nouvelle donne, aucun score
    } else r.turn = nextSeat(me)
    return
  }
  if (cur?.value === 'capot') fail('illegal_bid', 'Un capot est annoncé : vous pouvez seulement passer ou coincher.')
  let entry: BidEntry
  if (cmd.type === 'bid') {
    const v = cmd.value
    if (!Number.isInteger(v) || v < MIN_BID || v > MAX_BID || v % 10 !== 0)
      fail('illegal_bid', `Un contrat va de ${MIN_BID} à ${MAX_BID}, par multiples de 10.`)
    if (cur && v <= (cur.value as number)) fail('illegal_bid', `Il faut annoncer strictement plus que ${cur.value}.`)
    entry = { kind: 'bid', seat: me, value: v, suit: cmd.suit }
    r.contract = { seat: me, value: v, suit: cmd.suit, bidIndex: r.bids.length }
  } else {
    entry = { kind: 'capot', seat: me, suit: cmd.suit }
    r.contract = { seat: me, value: 'capot', suit: cmd.suit, bidIndex: r.bids.length }
  }
  r.bids.push(entry)
  r.consecutivePasses = 0
  r.turn = nextSeat(me)
}

function playCard(s: MatchState, r: RoundState, me: Seat, card: Card, now: number): void {
  const c = r.contract!
  const hand = r.hands[me]
  const idx = hand.findIndex((x) => sameCard(x, card))
  if (idx < 0) fail('illegal_card', "Cette carte n'est pas dans votre main.")
  const legal = legalCards(hand, r.trick, c.suit, me)
  if (!legal.some((x) => sameCard(x, card))) fail('illegal_card', "Cette carte n'est pas autorisée dans ce pli.")
  hand.splice(idx, 1)
  r.trick.push({ seat: me, card })
  // Belote-rebelote automatique, révélée seulement à la première carte concernée.
  if (r.beloteSeat === me && card.suit === c.suit && (card.rank === 'R' || card.rank === 'D')) {
    const done = r.beloteEvents.length
    r.beloteEvents.push({ seat: me, stage: done === 0 ? 'belote' : 'rebelote', trickIndex: r.tricks.length })
  }
  if (r.trick.length < 4) {
    r.turn = nextSeat(me)
    return
  }
  const winner = trickWinner(r.trick, c.suit)
  r.tricks.push({ cards: r.trick, winner })
  r.trick = []
  r.turn = winner // le gagnant entame le pli suivant
  if (r.tricks.length === 8) endRound(s, now)
}
