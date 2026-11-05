// Types partagés du moteur. Aucune dépendance à Vue ni au stockage.

export type GameKind = 'coinche' | 'belote' | 'tarot'
export type Suit = 'coeur' | 'carreau' | 'trefle' | 'pique'
export type TeamIdx = 0 | 1
export type RoundingMode = 'rounded' | 'exact'

export const GAME_LABELS: Record<GameKind, string> = { coinche: 'Coinche', belote: 'Belote', tarot: 'Tarot' }
export const SUIT_LABELS: Record<Suit, string> = { coeur: 'cœur', carreau: 'carreau', trefle: 'trèfle', pique: 'pique' }
export const SUIT_SYMBOLS: Record<Suit, string> = { coeur: '♥', carreau: '♦', trefle: '♣', pique: '♠' }

// ---------- Règles (copiées dans chaque partie) ----------
export interface CoincheRules {
  kind: 'coinche'
  rounding: RoundingMode
  /** Objectif en points (3 000 par défaut). */
  target: number
}
export interface BeloteRules {
  kind: 'belote'
  rounding: RoundingMode
  target: number
  announcements: boolean
}

export type TarotContract = 'pousse' | 'garde' | 'gardeSans' | 'gardeContre'
export type TarotBonusType =
  | 'petitAuBout'
  | 'poigneSimple'
  | 'poigneDouble'
  | 'poigneTriple'
  | 'blancTete'
  | 'blancAtout'
  | 'petitChelem'
  | 'grandChelem'

export interface TarotRules {
  kind: 'tarot'
  contractBases: Record<TarotContract, number>
  /** Montant versé par chaque autre joueur actif. */
  bonusValues: Record<TarotBonusType, number>
  endMode: 'free' | 'threshold'
  threshold: number
  /** Petit chelem annoncé réussi si le camp concède au plus ce nombre de plis. */
  petitChelemMaxConceded: number
}
export type Rules = CoincheRules | BeloteRules | TarotRules

export const TAROT_CONTRACT_LABELS: Record<TarotContract, string> = {
  pousse: 'Pousse',
  garde: 'Garde',
  gardeSans: 'Garde sans',
  gardeContre: 'Garde contre',
}
export const TAROT_BONUS_LABELS: Record<TarotBonusType, string> = {
  petitAuBout: 'Petit au bout',
  poigneSimple: 'Poignée simple',
  poigneDouble: 'Poignée double',
  poigneTriple: 'Poignée triple',
  blancTete: 'Blanc de tête',
  blancAtout: "Blanc d'atout",
  petitChelem: 'Petit chelem annoncé',
  grandChelem: 'Grand chelem annoncé',
}

export function defaultRules(kind: GameKind): Rules {
  if (kind === 'coinche') return { kind, rounding: 'rounded', target: 3000 }
  if (kind === 'belote') return { kind, rounding: 'rounded', target: 1000, announcements: true }
  return {
    kind,
    contractBases: { pousse: 40, garde: 80, gardeSans: 160, gardeContre: 320 },
    bonusValues: {
      petitAuBout: 10,
      poigneSimple: 10,
      poigneDouble: 20,
      poigneTriple: 30,
      blancTete: 10,
      blancAtout: 10,
      petitChelem: 10,
      grandChelem: 20,
    },
    endMode: 'free',
    threshold: 1000,
    petitChelemMaxConceded: 3,
  }
}

// ---------- Détail d'un calcul ----------
export type Outcome = 'success' | 'fail' | 'litige' | 'capot'

export interface ReserveItem {
  /** Donne ayant créé la réserve. */
  dealId: string
  plis: number
  annonces: number
  belote: number
  total: number
}

export interface TeamBreakdown {
  /** Points de plis exacts saisis (sans belote ni annonces). */
  exactPlis: number
  /** Points de plis retenus après arrondi éventuel. */
  retainedPlis: number
  annonces: number
  belote: number
  /** Total exact utilisé pour la comparaison (belote). */
  exactTotal: number
  score: number
}

export interface TeamDealDetail {
  outcome: Outcome
  /** Équipe qui a gagné la donne (null en cas de litige). */
  winnerTeam: TeamIdx | null
  multiplier: number
  teams: [TeamBreakdown, TeamBreakdown]
  delta: [number, number]
  /** Réserve créée par cette donne (litige). */
  reserveCreated: Omit<ReserveItem, 'dealId'> | null
  /** Lignes d'explication en français. */
  steps: string[]
}

export interface TarotBonusDetail {
  type: TarotBonusType
  playerId: string
  succeeded: boolean
  amountPerPlayer: number
  /** Variation par joueur inscrit (même ordre que game.playerIds). */
  delta: number[]
}

export interface TarotDealDetail {
  outcome: 'success' | 'fail'
  gap: number
  roundedGap: number
  base: number
  /** Valeur signée de la donne avant primes. */
  value: number
  contractDelta: number[]
  bonuses: TarotBonusDetail[]
  delta: number[]
  steps: string[]
}

export const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0)
