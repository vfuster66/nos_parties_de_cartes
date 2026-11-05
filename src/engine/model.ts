import type { BeloteInput } from './belote'
import type { CoincheInput } from './coinche'
import type { TarotInput } from './tarot'
import type { GameKind, Rules } from './types'

export interface Player { id: string; name: string; createdAt: string }
/** Équipe identifiée par ses deux membres (ordre indifférent). */
export interface Team { id: string; memberIds: [string, string]; name?: string; createdAt: string }
export interface Evening { id: string; name?: string; date: string; createdAt: string }

export type GameStatus = 'in_progress' | 'finished' | 'abandoned'

export interface Deal {
  id: string
  /** Identité du donneur conservée sur chaque donne. */
  dealerId: string
  /** Donne passée : aucun mouvement de points, le donneur tourne. */
  passed: boolean
  input: CoincheInput | BeloteInput | TarotInput | null
  createdAt: string
}

export interface Game {
  id: string
  kind: GameKind
  name?: string
  autoName: string
  eveningId: string | null
  startedAt: string
  endedAt: string | null
  status: GameStatus
  /** Joueurs dans l'ordre autour de la table. Coinche/belote : équipe 0 = places 0 et 2, équipe 1 = places 1 et 3. */
  playerIds: string[]
  teamIds: [string, string] | null
  firstDealerId: string
  rules: Rules
  deals: Deal[]
}

export interface Draft {
  /** Clé : `${gameId}::${dealId | 'new'}` */
  key: string
  gameId: string
  dealId: string | null
  form: unknown
  updatedAt: string
}

export interface Preferences {
  defaults: Record<GameKind, Rules>
}

export const gameTitle = (g: Game): string => g.name?.trim() || g.autoName
