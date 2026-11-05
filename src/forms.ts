// Conversion entre l'état des formulaires de saisie (textes) et les entrées du moteur.
import { ANNOUNCE_TYPES } from './engine/belote'
import type { AnnounceCounts, BeloteInput } from './engine/belote'
import type { CoincheInput, CoincheLevel } from './engine/coinche'
import { TRICK_TOTAL } from './engine/coinche'
import { teamOfPlayer } from './engine/game'
import type { Game } from './engine/model'
import type { AloneReason, TarotBonusInput, TarotInput } from './engine/tarot'
import type { Suit, TarotBonusType, TarotContract, TeamIdx } from './engine/types'

export interface TeamFormBase {
  takerId: string
  trump: Suit | ''
  /** À qui appartiennent les points saisis. */
  pointsOf: 'taker' | 'defense'
  points: string
  beloteTeam: 'none' | '0' | '1'
}
export interface CoincheForm extends TeamFormBase {
  contractMode: 'num' | 'capot'
  contract: string
  level: CoincheLevel
  coincheTeam: '' | '0' | '1'
  coincherId: string
  allTricks: boolean
}
export interface BeloteForm extends TeamFormBase {
  /** Équipe ayant remporté tous les plis. */
  capot: 'none' | '0' | '1'
  announcements: [AnnounceCounts, AnnounceCounts]
  strongest: '' | '0' | '1' | 'tie'
}
export interface TarotFormBonus { type: TarotBonusType; playerId: string; tricksConceded: string }
export interface TarotForm {
  takerId: string
  contract: TarotContract
  gap: string
  success: 'success' | 'fail'
  /** À cinq actifs. */
  callMode: 'partner' | 'self_call' | 'king_in_dog'
  calledId: string
  bonuses: TarotFormBonus[]
}
export type DealForm = CoincheForm | BeloteForm | TarotForm

const base = (): TeamFormBase => ({ takerId: '', trump: '', pointsOf: 'taker', points: '', beloteTeam: 'none' })

export function emptyForm(kind: Game['kind']): DealForm {
  if (kind === 'coinche')
    return { ...base(), contractMode: 'num', contract: '80', level: 'none', coincheTeam: '', coincherId: '', allTricks: false }
  if (kind === 'belote') return { ...base(), capot: 'none', announcements: [{}, {}], strongest: '' }
  return { takerId: '', contract: 'garde', gap: '', success: 'success', callMode: 'partner', calledId: '', bonuses: [] }
}

/** Nombre décimal saisi avec virgule ou point ; chaîne vide ou invalide → NaN. */
export function parseNum(s: string): number {
  const t = s.trim().replace(',', '.')
  return t === '' || !/^-?\d+(\.\d+)?$/.test(t) ? NaN : Number(t)
}

export interface Parsed<T> { input?: T; errors: string[] }

function parsePoints(f: TeamFormBase, allTricks: boolean, errors: string[]): number {
  if (allTricks) return TRICK_TOTAL
  const v = parseNum(f.points)
  if (!Number.isFinite(v) || !Number.isInteger(v)) {
    errors.push('Saisissez les points de plis (nombre entier, sans belote ni annonces).')
    return NaN
  }
  if (v < 0 || v > TRICK_TOTAL) errors.push(`Les points de plis doivent être compris entre 0 et ${TRICK_TOTAL}.`)
  return f.pointsOf === 'taker' ? v : TRICK_TOTAL - v
}

const beloteOf = (b: TeamFormBase['beloteTeam']): TeamIdx | null => (b === 'none' ? null : (Number(b) as TeamIdx))

export function coincheFromForm(g: Game, f: CoincheForm): Parsed<CoincheInput> {
  const errors: string[] = []
  if (!f.takerId) errors.push('Choisissez le joueur preneur.')
  if (!f.trump) errors.push('Choisissez la couleur d’atout.')
  const team = teamOfPlayer(g, f.takerId)
  const contract = f.contractMode === 'capot' ? 'capot' : parseNum(f.contract)
  if (contract !== 'capot' && !Number.isFinite(contract)) errors.push('Saisissez un contrat numérique valide.')
  const takerPoints = parsePoints(f, f.allTricks, errors)
  if (f.allTricks && f.contractMode === 'capot') {
    /* capot annoncé réalisé */
  }
  if (f.level !== 'none' && f.coincheTeam === '') errors.push('Indiquez l’équipe qui a coinché.')
  if (f.coincheTeam !== '' && team != null && Number(f.coincheTeam) === team) errors.push('Les preneurs ne peuvent pas coincher leur propre contrat.')
  if (errors.length || team == null) return { errors: errors.length ? errors : ['Le preneur doit faire partie de la partie.'] }
  const input: CoincheInput = {
    takerId: f.takerId, takerTeam: team, contract, trump: f.trump as Suit, level: f.level,
    coincheTeam: f.level === 'none' || f.coincheTeam === '' ? null : (Number(f.coincheTeam) as TeamIdx),
    coincherId: f.level === 'none' ? null : f.coincherId || null,
    takerPoints: f.allTricks ? TRICK_TOTAL : takerPoints, allTricks: f.allTricks, beloteTeam: beloteOf(f.beloteTeam),
  }
  return { input, errors: [] }
}

export function beloteFromForm(g: Game, f: BeloteForm): Parsed<BeloteInput> {
  const errors: string[] = []
  if (!f.takerId) errors.push('Choisissez le joueur preneur.')
  if (!f.trump) errors.push('Choisissez la couleur d’atout.')
  const team = teamOfPlayer(g, f.takerId)
  const capotTeam: TeamIdx | null = f.capot === 'none' ? null : (Number(f.capot) as TeamIdx)
  const takerPoints = parsePoints(f, capotTeam != null, errors)
  if (errors.length || team == null) return { errors: errors.length ? errors : ['Le preneur doit faire partie de la partie.'] }
  const input: BeloteInput = {
    takerId: f.takerId, takerTeam: team, trump: f.trump as Suit, takerPoints: capotTeam != null ? 0 : takerPoints, capotTeam,
    announcements: f.announcements, strongest: f.strongest === '' ? null : f.strongest === 'tie' ? 'tie' : (Number(f.strongest) as TeamIdx),
    beloteTeam: beloteOf(f.beloteTeam),
  }
  return { input, errors: [] }
}

export function tarotFromForm(f: TarotForm, active: number): Parsed<TarotInput> {
  const errors: string[] = []
  const gap = parseNum(f.gap)
  if (!Number.isFinite(gap) || gap < 0) errors.push('Saisissez l’écart exact (nombre positif ou nul, par pas de 0,5).')
  else if (!Number.isInteger(gap * 2)) errors.push('L’écart se saisit par pas de 0,5.')
  if (!f.takerId) errors.push('Choisissez le joueur preneur.')
  if (active === 5 && f.callMode === 'partner' && !f.calledId) errors.push('Choisissez le joueur appelé.')
  if (errors.length) return { errors }
  const input: TarotInput = {
    takerId: f.takerId, contract: f.contract, gap, success: gap === 0 ? true : f.success === 'success',
    calledId: active === 5 && f.callMode === 'partner' ? f.calledId : null,
    aloneReason: active === 5 && f.callMode !== 'partner' ? (f.callMode as AloneReason) : null,
    bonuses: f.bonuses.map((b): TarotBonusInput => ({
      type: b.type, playerId: b.playerId,
      ...(b.type === 'petitChelem' || b.type === 'grandChelem' ? { tricksConceded: parseNum(b.tricksConceded) } : {}),
    })),
  }
  return { input, errors: [] }
}

export function inputToForm(g: Game, input: CoincheInput | BeloteInput | TarotInput): DealForm {
  if (g.kind === 'tarot') {
    const i = input as TarotInput
    return {
      takerId: i.takerId, contract: i.contract, gap: String(i.gap), success: i.success ? 'success' : 'fail',
      callMode: i.calledId ? 'partner' : (i.aloneReason ?? 'partner'), calledId: i.calledId ?? '',
      bonuses: i.bonuses.map((b) => ({ type: b.type, playerId: b.playerId, tricksConceded: String(b.tricksConceded ?? 0) })),
    }
  }
  const common = {
    takerId: (input as CoincheInput).takerId, trump: (input as CoincheInput).trump, pointsOf: 'taker' as const,
    points: String((input as CoincheInput).takerPoints), beloteTeam: ((input as CoincheInput).beloteTeam == null ? 'none' : String((input as CoincheInput).beloteTeam)) as TeamFormBase['beloteTeam'],
  }
  if (g.kind === 'coinche') {
    const i = input as CoincheInput
    return {
      ...common, contractMode: i.contract === 'capot' ? 'capot' : 'num', contract: i.contract === 'capot' ? '80' : String(i.contract),
      level: i.level, coincheTeam: i.coincheTeam == null ? '' : (String(i.coincheTeam) as '0' | '1'), coincherId: i.coincherId ?? '',
      allTricks: i.allTricks, points: i.allTricks ? '' : common.points,
    }
  }
  const i = input as BeloteInput
  return {
    ...common, capot: i.capotTeam == null ? 'none' : (String(i.capotTeam) as '0' | '1'), points: i.capotTeam == null ? common.points : '',
    announcements: JSON.parse(JSON.stringify(i.announcements)) as BeloteInput['announcements'],
    strongest: i.strongest == null ? '' : (String(i.strongest) as '0' | '1' | 'tie'),
  }
}

export const hasAnnouncements = (f: BeloteForm): boolean => f.announcements.some((a) => ANNOUNCE_TYPES.some((t) => (a[t] ?? 0) > 0))
