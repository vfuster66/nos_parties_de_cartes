// Vues filtrées envoyées aux clients. Construites champ par champ (liste blanche) : on ne copie jamais l'état serveur.
import type { CoincheLevel } from '../../src/engine/coinche'
import type { TeamDealDetail } from '../../src/engine/types'
import { sortHand, teamOf } from './cards'
import type { Card, Seat, Suit, TeamIdx, TrickCard } from './cards'
import { isPaused, seatOf } from './engine'
import { legalCards } from './rules'
import { MAX_BID, MIN_BID } from './types'
import type {
  BeloteEvent,
  BidEntry,
  Config,
  Contract,
  MatchState,
  MatchStatus,
  PlayedTrick,
  RoundRecord,
} from './types'

export interface ParticipantView {
  id: string
  nickname: string
  seat: Seat | null
  connected: boolean
  ready: boolean
  isHost: boolean
}

export interface RoundRecordView {
  index: number
  dealer: Seat
  passed: boolean
  bids: BidEntry[]
  contract: Contract | null
  level: CoincheLevel
  takerTeam: TeamIdx | null
  trickCounts: [number, number]
  trickPoints: [number, number]
  beloteTeam: TeamIdx | null
  detail: TeamDealDetail | null
  delta: [number, number]
  totalsAfter: [number, number]
}

export interface WindowView {
  /** Estimation : le serveur reste maître de l'échéance. */
  remainingMs: number
  running: boolean
  acceptedSeats: Seat[]
}

export interface RoundView {
  index: number
  dealer: Seat
  phase: 'bidding' | 'window' | 'playing' | 'summary'
  turn: Seat | null
  bids: BidEntry[]
  contract: Contract | null
  level: CoincheLevel
  window: WindowView | null
  trick: TrickCard[]
  lastTrick: PlayedTrick | null
  tricks: PlayedTrick[]
  trickCounts: [number, number]
  cardsLeft: [number, number, number, number]
  beloteEvents: BeloteEvent[]
  readyForNext: Seat[]
}

export interface Actions {
  // Salon
  freeSeats: Seat[]
  canLeaveSeat: boolean
  canReady: boolean
  canConfigure: boolean
  canStart: boolean
  canManageSeats: boolean
  // Enchères
  canPass: boolean
  bid: { min: number; max: number; step: number } | null
  capot: { suggestedSuits: Suit[] } | null
  coinche: { contractRef: number } | null
  canSurcoinche: boolean
  canAcceptCoinche: boolean
  // Jeu
  playable: Card[]
  canReadyNext: boolean
  canAbandon: boolean
}

export interface RoomView {
  version: number
  roomId: string
  code: string
  status: MatchStatus
  config: Config
  you: { participantId: string; seat: Seat | null; isHost: boolean }
  participants: ParticipantView[]
  seats: (string | null)[]
  pause: { reason: string; disconnectedSeats: Seat[] } | null
  totals: [number, number]
  round: RoundView | null
  rounds: RoundRecordView[]
  /** Votre main uniquement. */
  hand: Card[]
  actions: Actions
  result: { winnerTeam: TeamIdx | null; totals: [number, number] } | null
  startedAt: number | null
  endedAt: number | null
  serverNow: number
}

const recordView = (r: RoundRecord): RoundRecordView => ({
  index: r.index,
  dealer: r.dealer,
  passed: r.passed,
  bids: r.bids.map((b) => ({ ...b })),
  contract: r.contract && { ...r.contract },
  level: r.level,
  takerTeam: r.takerTeam,
  trickCounts: [...r.trickCounts],
  trickPoints: [...r.trickPoints],
  beloteTeam: r.beloteTeam,
  detail: r.detail && structuredClone(r.detail),
  delta: [...r.delta],
  totalsAfter: [...r.totalsAfter],
})

export function allowedActions(state: MatchState, pid: string, paused: boolean): Actions {
  const seat = seatOf(state, pid)
  const isHost = state.hostId === pid
  const r = state.round
  const none: Actions = {
    freeSeats: [],
    canLeaveSeat: false,
    canReady: false,
    canConfigure: false,
    canStart: false,
    canManageSeats: false,
    canPass: false,
    bid: null,
    capot: null,
    coinche: null,
    canSurcoinche: false,
    canAcceptCoinche: false,
    playable: [],
    canReadyNext: false,
    canAbandon: false,
  }
  if (state.status === 'finished' || state.status === 'abandoned') return none
  const a = { ...none, canAbandon: isHost }
  if (state.status === 'lobby') {
    a.freeSeats = ([0, 1, 2, 3] as Seat[]).filter((s) => !state.seats[s]) // changer de place reste possible
    a.canLeaveSeat = seat != null
    a.canReady = seat != null
    a.canConfigure = isHost
    a.canManageSeats = isHost
    a.canStart = isHost && !paused && state.seats.every((s) => s && state.readyIds.includes(s))
    return a
  }
  if (!r || seat == null || paused) return a
  if (r.phase === 'bidding') {
    const cur = r.contract
    if (r.turn === seat) {
      a.canPass = true
      if (cur?.value !== 'capot') {
        a.bid = { min: cur ? (cur.value as number) + 10 : MIN_BID, max: MAX_BID, step: 10 }
        if (a.bid.min > MAX_BID) a.bid = null
        const mine = new Set<Suit>()
        for (const b of r.bids)
          if ((b.kind === 'bid' || b.kind === 'capot') && teamOf(b.seat) === teamOf(seat)) mine.add(b.suit)
        a.capot = { suggestedSuits: [...mine] }
      }
    }
    if (cur && teamOf(seat) !== teamOf(cur.seat)) a.coinche = { contractRef: cur.bidIndex }
  } else if (r.phase === 'window' && r.contract && teamOf(seat) === teamOf(r.contract.seat)) {
    const open = r.window?.deadlineAt != null
    a.canSurcoinche = open
    a.canAcceptCoinche = open && !r.window!.acceptedSeats.includes(seat)
  } else if (r.phase === 'playing' && r.turn === seat && r.contract) {
    a.playable = legalCards(r.hands[seat], r.trick, r.contract.suit, seat)
  } else if (r.phase === 'summary' && state.status === 'playing') {
    a.canReadyNext = !r.readyForNext.includes(seat)
  }
  return a
}

export function buildView(state: MatchState, pid: string, connected: ReadonlySet<string>, now: number): RoomView {
  const seat = seatOf(state, pid)
  // Absence d'une personne assise : bloque aussi le lancement depuis le salon (le serveur refuse `start`).
  const absent = isPaused(state, connected)
  const paused = state.status === 'playing' && absent
  const r = state.round
  const disconnectedSeats = ([0, 1, 2, 3] as Seat[]).filter((s) => state.seats[s] && !connected.has(state.seats[s]!))
  let round: RoundView | null = null
  if (r) {
    const w = r.window
    const counts: [number, number] = [0, 0]
    for (const t of r.tricks) counts[teamOf(t.winner)] += 1
    const lastTrick = r.tricks.length ? r.tricks[r.tricks.length - 1] : null
    round = {
      index: r.index,
      dealer: r.dealer,
      phase: r.phase,
      turn: r.turn,
      bids: r.bids.map((b) => ({ ...b })),
      contract: r.contract && { ...r.contract },
      level: r.level,
      window: w && {
        remainingMs: w.deadlineAt == null ? w.remainingMs : Math.max(0, w.deadlineAt - now),
        running: w.deadlineAt != null,
        acceptedSeats: [...w.acceptedSeats],
      },
      trick: r.trick.map((t) => ({ seat: t.seat, card: { ...t.card } })),
      lastTrick: lastTrick && structuredClone(lastTrick),
      tricks: structuredClone(r.tricks),
      trickCounts: counts,
      cardsLeft: r.hands.map((h) => h.length) as [number, number, number, number],
      // La belote n'apparaît qu'une fois la première carte jouée : beloteSeat reste privé.
      beloteEvents: r.beloteEvents.map((e) => ({ ...e })),
      readyForNext: [...r.readyForNext],
    }
  }
  const trump = r?.contract?.suit ?? null
  return {
    version: state.version,
    roomId: state.id,
    code: state.code,
    status: state.status,
    config: structuredClone(state.config),
    you: { participantId: pid, seat, isHost: state.hostId === pid },
    participants: state.participants.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      seat: seatOf(state, p.id),
      connected: connected.has(p.id),
      ready: state.readyIds.includes(p.id),
      isHost: state.hostId === p.id,
    })),
    seats: [...state.seats],
    pause: paused
      ? {
          reason:
            disconnectedSeats.length === 1
              ? 'Un joueur est déconnecté : la partie reprendra à son retour.'
              : 'Des joueurs sont déconnectés : la partie reprendra à leur retour.',
          disconnectedSeats,
        }
      : null,
    totals: [...state.totals],
    round,
    rounds: state.rounds.map(recordView),
    hand: seat != null && r ? sortHand(r.hands[seat], trump) : [],
    actions: allowedActions(state, pid, absent),
    result: state.result && { winnerTeam: state.result.winnerTeam, totals: [...state.result.totals] },
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    serverNow: now,
  }
}
