// État complet d'un salon / d'une partie de coinche en ligne. Cet état est PRIVÉ au serveur :
// les clients ne reçoivent que les vues construites dans views.ts.
import type { evaluateBeloteAnnouncements } from './belote'
import type { TarotMatch } from '../tarot/game'
import type { CoincheLevel } from '../../src/engine/coinche'
import type { TeamDealDetail } from '../../src/engine/types'
import type { RoundingMode } from '../../src/engine/types'
import type { Card, Seat, Suit, TeamIdx, TrickCard } from './cards'

export const SURCOINCHE_WINDOW_MS = 10_000
export const MIN_BID = 80
export const MAX_BID = 160

export interface Participant {
  id: string
  nickname: string
  joinedAt: number
  /** Joueur contrôlé par le serveur, sans connexion ni session utilisateur. */
  isBot?: true
}

export type OnlineGame = 'coinche' | 'belote' | 'belote-annonces' | 'tarot' | 'tarot-3' | 'tarot-5' | 'tarot-6'

export const isOnlineTarot = (game?: OnlineGame): boolean =>
  game === 'tarot' || game === 'tarot-3' || game === 'tarot-5' || game === 'tarot-6'

export const onlineSeatCount = (game?: OnlineGame): 3 | 4 | 5 | 6 =>
  game === 'tarot-3' ? 3 : game === 'tarot-5' ? 5 : game === 'tarot-6' ? 6 : 4

export interface Config {
  game?: OnlineGame
  tarotEndMode?: 'free' | 'threshold'
  gameName: string
  teamNames: [string, string]
  rounding: RoundingMode
  target: number
  /** Premier donneur : place explicite ou tirage au sort au lancement. */
  firstDealer: 'random' | Seat
}

export type BidEntry =
  | { kind: 'pass'; seat: Seat }
  | { kind: 'take'; seat: Seat; suit: Suit }
  | { kind: 'bid'; seat: Seat; value: number; suit: Suit }
  | { kind: 'capot'; seat: Seat; suit: Suit }
  | { kind: 'coinche'; seat: Seat; contractRef: number }
  | { kind: 'surcoinche'; seat: Seat }
  | { kind: 'accept'; seat: Seat }

export interface Contract {
  seat: Seat
  value: number | 'capot' | 'prise'
  suit: Suit
  /** Index de l'enchère dans `bids` : identifie ce contrat précis (anti-coinche obsolète). */
  bidIndex: number
}

export interface CoincheWindow {
  /** Temps restant quand la fenêtre est suspendue (ou à la création). */
  remainingMs: number
  /** Échéance (ms epoch serveur) quand le compte à rebours court ; null si suspendu. */
  deadlineAt: number | null
  acceptedSeats: Seat[]
}

export interface BeloteEvent {
  seat: Seat
  stage: 'belote' | 'rebelote'
  trickIndex: number
}

export interface PlayedTrick {
  cards: TrickCard[]
  winner: Seat
}

export interface RoundRecord {
  index: number
  dealer: Seat
  passed: boolean
  bids: BidEntry[]
  contract: Contract | null
  level: CoincheLevel
  coincheTeam: TeamIdx | null
  takerTeam: TeamIdx | null
  trickCounts: [number, number]
  /** Points de plis exacts (dernier pli inclus, belote exclue). */
  trickPoints: [number, number]
  beloteTeam: TeamIdx | null
  tricks: PlayedTrick[]
  detail: TeamDealDetail | null
  delta: [number, number]
  totalsAfter: [number, number]
}

export interface RoundState {
  index: number
  dealer: Seat
  phase: 'bidding' | 'window' | 'playing' | 'summary'
  /** PRIVÉ : mains actuelles. */
  hands: Card[][]
  announcements?: ReturnType<typeof evaluateBeloteAnnouncements>
  beloteDeal?: { turned: Card; remaining: Card[]; pass: 1 | 2 }
  /** PRIVÉ jusqu'à la première annonce : place détenant roi + dame d'atout dans la main initiale. */
  beloteSeat: Seat | null
  bids: BidEntry[]
  turn: Seat | null
  consecutivePasses: number
  contract: Contract | null
  level: CoincheLevel
  coincheSeat: Seat | null
  window: CoincheWindow | null
  trick: TrickCard[]
  tricks: PlayedTrick[]
  beloteEvents: BeloteEvent[]
  readyForNext: Seat[]
}

export type MatchStatus = 'lobby' | 'playing' | 'finished' | 'abandoned'

export interface MatchResult {
  /** null : partie abandonnée (aucune victoire attribuée). */
  winnerTeam: TeamIdx | null
  totals: [number, number]
}

export interface MatchState {
  schema: 1
  id: string
  code: string
  /** Numéro monotone, incrémenté à chaque changement visible. */
  version: number
  createdAt: number
  startedAt: number | null
  endedAt: number | null
  status: MatchStatus
  hostId: string
  participants: Participant[]
  seats: (string | null)[]
  readyIds: string[]
  config: Config
  totals: [number, number]
  round: RoundState | null
  tarot?: TarotMatch
  rounds: RoundRecord[]
  reserve?: number
  result: MatchResult | null
}

export type ErrorCode =
  | 'invalid'
  | 'stale'
  | 'stale_contract'
  | 'paused'
  | 'wrong_phase'
  | 'not_your_turn'
  | 'forbidden'
  | 'illegal_bid'
  | 'illegal_card'
  | 'window_closed'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'full'
  | 'unauthorized'

export class RuleError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}
