import type { BeloteInput } from './belote'
import type { CoincheInput } from './coinche'
import { computeGame, computeResult, entityPlayerIds } from './game'
import type { Game, Player, Team } from './model'
import type { GameKind } from './types'

export interface Tally {
  played: number
  wins: number
  losses: number
  draws: number
  takes: number
  takeSuccess: number
  takeFail: number
  takeLitige: number
}
const emptyTally = (): Tally => ({
  played: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  takes: 0,
  takeSuccess: 0,
  takeFail: 0,
  takeLitige: 0,
})
export const winRate = (t: Tally): number => (t.played ? t.wins / t.played : 0)

export interface Participation {
  gameId: string
  kind: GameKind
  playerIds: string[]
  teamId: string | null
  score: number
  result: 'win' | 'loss' | 'draw'
  takes: { playerId: string; outcome: 'success' | 'fail' | 'litige' }[]
}

/** Participations d'une partie terminée, recalculées depuis ses donnes. */
export function participations(g: Game): Participation[] {
  if (g.status !== 'finished') return []
  const state = computeGame(g)
  const res = computeResult(g, state.totals)
  const takesAll: Participation['takes'] = []
  for (const row of state.rows) {
    if (row.deal.passed || !row.deal.input) continue
    const input = row.deal.input as { takerId: string }
    if (row.teamDetail) {
      const t = row.teamDetail
      const takerTeam = (row.deal.input as CoincheInput | BeloteInput).takerTeam
      takesAll.push({
        playerId: input.takerId,
        outcome: t.outcome === 'litige' ? 'litige' : t.winnerTeam === takerTeam ? 'success' : 'fail',
      })
    } else if (row.tarotDetail) takesAll.push({ playerId: input.takerId, outcome: row.tarotDetail.outcome })
  }
  return state.totals.map((score, idx) => {
    const ids = entityPlayerIds(g, idx)
    const win = res.winners.includes(idx)
    return {
      gameId: g.id,
      kind: g.kind,
      playerIds: ids,
      teamId: g.teamIds ? g.teamIds[idx] : null,
      score,
      result: win ? (res.draw ? 'draw' : 'win') : 'loss',
      takes: takesAll.filter((t) => ids.includes(t.playerId)),
    } as Participation
  })
}

export function tallyOf(parts: Participation[]): Tally {
  const t = emptyTally()
  for (const p of parts) {
    t.played++
    if (p.result === 'win') t.wins++
    else if (p.result === 'draw') t.draws++
    else t.losses++
    for (const k of p.takes) {
      t.takes++
      if (k.outcome === 'success') t.takeSuccess++
      else if (k.outcome === 'fail') t.takeFail++
      else t.takeLitige++
    }
  }
  return t
}

export interface RankRow {
  id: string
  name: string
  tally: Tally
  rate: number
  rank: number
}

function rankRows(rows: Omit<RankRow, 'rank'>[]): RankRow[] {
  const sorted = [...rows].sort(
    (a, b) => b.tally.wins - a.tally.wins || b.rate - a.rate || a.name.localeCompare(b.name, 'fr'),
  )
  const out: RankRow[] = []
  sorted.forEach((r, i) => {
    const prev = out[i - 1]
    const same = prev && prev.tally.wins === r.tally.wins && prev.rate === r.rate
    out.push({ ...r, rank: same ? prev.rank : i + 1 })
  })
  return out
}

export interface StatsData {
  players: Player[]
  teams: Team[]
  games: Game[]
}

/** Classement des joueurs, par jeu (ou tous jeux confondus si kind est null) et éventuellement par soirée. */
export function playerRanking(data: StatsData, kind: GameKind | null, eveningId?: string): RankRow[] {
  const parts = data.games
    .filter((g) => (!kind || g.kind === kind) && (!eveningId || g.eveningId === eveningId))
    .flatMap(participations)
  return rankRows(
    data.players
      .map((p) => {
        const tally = tallyOf(parts.filter((x) => x.playerIds.includes(p.id)))
        return { id: p.id, name: p.name, tally, rate: winRate(tally) }
      })
      .filter((r) => r.tally.played > 0),
  )
}

export function teamLabel(data: StatsData, t: Team): string {
  if (t.name?.trim()) return t.name.trim()
  const nm = (id: string) => data.players.find((p) => p.id === id)?.name ?? '?'
  return `${nm(t.memberIds[0])} & ${nm(t.memberIds[1])}`
}

export function teamRanking(data: StatsData, kind: GameKind | null, eveningId?: string): RankRow[] {
  const parts = data.games
    .filter((g) => g.kind !== 'tarot' && (!kind || g.kind === kind) && (!eveningId || g.eveningId === eveningId))
    .flatMap(participations)
  return rankRows(
    data.teams
      .map((t) => {
        const tally = tallyOf(parts.filter((x) => x.teamId === t.id))
        return { id: t.id, name: teamLabel(data, t), tally, rate: winRate(tally) }
      })
      .filter((r) => r.tally.played > 0),
  )
}

export function playerParticipations(data: StatsData, playerId: string, kind?: GameKind): Participation[] {
  return data.games
    .filter((g) => !kind || g.kind === kind)
    .flatMap(participations)
    .filter((p) => p.playerIds.includes(playerId))
}
export function teamParticipations(data: StatsData, teamId: string): Participation[] {
  return data.games.flatMap(participations).filter((p) => p.teamId === teamId)
}

/** Partenaires d'un joueur (coinche/belote) avec le nombre de parties terminées jouées ensemble. */
export function partnersOf(data: StatsData, playerId: string): { partnerId: string; played: number; wins: number }[] {
  const map = new Map<string, { partnerId: string; played: number; wins: number }>()
  for (const p of playerParticipations(data, playerId)) {
    if (p.kind === 'tarot') continue
    const partner = p.playerIds.find((x) => x !== playerId)
    if (!partner) continue
    const e = map.get(partner) ?? { partnerId: partner, played: 0, wins: 0 }
    e.played++
    if (p.result === 'win') e.wins++
    map.set(partner, e)
  }
  return [...map.values()].sort((a, b) => b.played - a.played)
}

/** Nombre de parties jouées (toutes, y compris en cours/abandonnées) pour information. */
export function gamesCount(games: Game[]) {
  return { total: games.length, finished: games.filter((g) => g.status === 'finished').length }
}
