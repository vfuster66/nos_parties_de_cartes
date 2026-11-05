import { scoreBelote } from './belote'
import type { BeloteInput } from './belote'
import { scoreCoinche } from './coinche'
import type { CoincheInput } from './coinche'
import type { Deal, Game } from './model'
import { activePlayers, scoreTarot } from './tarot'
import type { TarotInput } from './tarot'
import type { ReserveItem, TarotDealDetail, TeamDealDetail } from './types'
import { sum } from './types'

export interface DealRow {
  deal: Deal
  index: number
  /** Variation par entité : équipes (coinche/belote) ou joueurs inscrits (tarot). */
  delta: number[]
  totalsAfter: number[]
  teamDetail: TeamDealDetail | null
  tarotDetail: TarotDealDetail | null
  error: string | null
  reserveBefore: ReserveItem[]
  reserveAwarded: ReserveItem[]
  reserveCreated: ReserveItem | null
  reserveAfter: ReserveItem[]
  /** Équipe bénéficiaire de la réserve attribuée. */
  reserveWinner: number | null
}

export interface GameState {
  rows: DealRow[]
  totals: number[]
  reserve: ReserveItem[]
  endReached: boolean
  nextDealerId: string
  /** Donneur au repos pour la prochaine donne (tarot à six). */
  nextRestingId: string | null
}

export const entityCount = (g: Game): number => (g.kind === 'tarot' ? g.playerIds.length : 2)

/** Donneur suivant : place suivante autour de la table. */
export function nextAfter(g: Game, dealerId: string): string {
  const i = g.playerIds.indexOf(dealerId)
  return g.playerIds[(i + 1) % g.playerIds.length] ?? g.firstDealerId
}

/** Calcule scores, réserves et état d'une partie à partir de ses seules donnes. */
export function computeGame(g: Game): GameState {
  const n = entityCount(g)
  let totals = new Array<number>(n).fill(0)
  let reserve: ReserveItem[] = []
  const rows: DealRow[] = []
  g.deals.forEach((deal, index) => {
    let delta = new Array<number>(n).fill(0)
    let teamDetail: TeamDealDetail | null = null
    let tarotDetail: TarotDealDetail | null = null
    let error: string | null = null
    let created: ReserveItem | null = null
    let awarded: ReserveItem[] = []
    let winner: number | null = null
    const before = reserve
    if (!deal.passed && deal.input) {
      try {
        if (g.kind === 'tarot') {
          tarotDetail = scoreTarot(deal.input as TarotInput, { playerIds: g.playerIds, dealerId: deal.dealerId }, g.rules as never)
          delta = [...tarotDetail.delta]
        } else {
          teamDetail =
            g.kind === 'coinche'
              ? scoreCoinche(deal.input as CoincheInput, g.rules as never)
              : scoreBelote(deal.input as BeloteInput, g.rules as never)
          delta = [...teamDetail.delta]
          if (teamDetail.reserveCreated) {
            created = { dealId: deal.id, ...teamDetail.reserveCreated }
            reserve = [...reserve, created]
          } else if (reserve.length && teamDetail.winnerTeam != null) {
            winner = teamDetail.winnerTeam
            awarded = reserve
            delta[winner] += sum(reserve.map((r) => r.total))
            reserve = []
          }
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
      }
    }
    totals = totals.map((t, k) => t + delta[k])
    rows.push({
      deal, index, delta, totalsAfter: totals, teamDetail, tarotDetail, error,
      reserveBefore: before, reserveAwarded: awarded, reserveCreated: created, reserveAfter: reserve, reserveWinner: winner,
    })
  })
  const last = g.deals[g.deals.length - 1]
  const nextDealerId = last ? nextAfter(g, last.dealerId) : g.firstDealerId
  return {
    rows,
    totals,
    reserve,
    endReached: isEndReached(g, totals, reserve),
    nextDealerId,
    nextRestingId: g.kind === 'tarot' && g.playerIds.length === 6 ? nextDealerId : null,
  }
}

/** Condition de fin, évaluée à la fin de la donne. */
export function isEndReached(g: Game, totals: number[], reserve: ReserveItem[]): boolean {
  if (!g.deals.length) return false
  const r = g.rules
  if (r.kind === 'tarot') return r.endMode === 'threshold' && totals.some((t) => Math.abs(t) >= r.threshold)
  if (reserve.length) return false // litige non résolu : on poursuit
  const reached = totals.filter((t) => t >= r.target)
  if (!reached.length) return false
  return totals[0] !== totals[1] // égalité : on poursuit
}

export interface RankEntry { index: number; score: number; rank: number }
export interface GameResult { ranking: RankEntry[]; winners: number[]; draw: boolean }

/** Classement final (ex æquo conservés). */
export function computeResult(g: Game, totals = computeGame(g).totals): GameResult {
  const sorted = totals.map((score, index) => ({ index, score })).sort((a, b) => b.score - a.score || a.index - b.index)
  const ranking: RankEntry[] = []
  sorted.forEach((e, i) => {
    const rank = i > 0 && sorted[i - 1].score === e.score ? ranking[i - 1].rank : i + 1
    ranking.push({ ...e, rank })
  })
  const winners = ranking.filter((r) => r.rank === 1).map((r) => r.index)
  return { ranking, winners, draw: g.kind !== 'tarot' && winners.length === 2 }
}

/** Joueurs (identifiants) de chaque entité : équipe 0/1 ou joueur. */
export function entityPlayerIds(g: Game, idx: number): string[] {
  if (g.kind === 'tarot') return [g.playerIds[idx]]
  return idx === 0 ? [g.playerIds[0], g.playerIds[2]] : [g.playerIds[1], g.playerIds[3]]
}

/** Équipe (0/1) d'un joueur dans une partie de coinche/belote. */
export function teamOfPlayer(g: Game, playerId: string): 0 | 1 | null {
  const i = g.playerIds.indexOf(playerId)
  return i < 0 ? null : ((i % 2) as 0 | 1)
}

/** Joueurs actifs pour une donne donnée. */
export function activeFor(g: Game, dealerId: string): string[] {
  return g.kind === 'tarot' ? activePlayers({ playerIds: g.playerIds, dealerId }) : g.playerIds
}

/** Remet les donneurs dans l'ordre à partir du premier donneur (action explicite). */
export function recomputeDealers(g: Game): Game {
  let d = g.firstDealerId
  const deals = g.deals.map((x) => {
    const out = { ...x, dealerId: d }
    d = nextAfter(g, d)
    return out
  })
  return { ...g, deals }
}
