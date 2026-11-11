import { BELOTE_POINTS, CAPOT_POINTS, TRICK_TOTAL } from './coinche'
import { roundToTenHalfUp } from './rounding'
import type { BeloteRules, ReserveItem, Suit, TeamBreakdown, TeamDealDetail, TeamIdx } from './types'

export type AnnounceType = 'tierce' | 'cinquante' | 'cent' | 'carre78' | 'carre9' | 'carreValets' | 'carreAutre'

export const ANNOUNCE_POINTS: Record<AnnounceType, number> = {
  tierce: 20,
  cinquante: 50,
  cent: 100,
  carre78: 0,
  carre9: 150,
  carreValets: 200,
  carreAutre: 100,
}
export const ANNOUNCE_LABELS: Record<AnnounceType, string> = {
  tierce: 'Tierce',
  cinquante: 'Cinquante',
  cent: 'Cent',
  carre78: 'Carré de 7 ou de 8',
  carre9: 'Carré de 9',
  carreValets: 'Carré de valets',
  carreAutre: "Carré d'as, de 10, de rois ou de dames",
}
export const ANNOUNCE_TYPES = Object.keys(ANNOUNCE_POINTS) as AnnounceType[]

export type AnnounceCounts = Partial<Record<AnnounceType, number>>

export interface BeloteInput {
  takerId: string
  takerTeam: TeamIdx
  trump: Suit
  /** Points de plis exacts des preneurs (belote et annonces exclues). */
  takerPoints: number
  /** Équipe ayant remporté tous les plis, le cas échéant. */
  capotTeam: TeamIdx | null
  announcements: [AnnounceCounts, AnnounceCounts]
  /** Équipe possédant la plus forte annonce : choix explicite de l'utilisateur. */
  strongest: TeamIdx | 'tie' | null
  beloteTeam: TeamIdx | null
}

export const announcePoints = (c: AnnounceCounts): number =>
  ANNOUNCE_TYPES.reduce((s, t) => s + (c[t] ?? 0) * ANNOUNCE_POINTS[t], 0)
export const announceCount = (c: AnnounceCounts): number => ANNOUNCE_TYPES.reduce((s, t) => s + (c[t] ?? 0), 0)

export function validateBeloteInput(
  i: BeloteInput,
  rules: BeloteRules,
  options: { allowFullPoints?: boolean } = {},
): string[] {
  const errors: string[] = []
  if (!i.takerId) errors.push('Choisissez le joueur preneur.')
  if (i.capotTeam == null) {
    if (!Number.isFinite(i.takerPoints) || !Number.isInteger(i.takerPoints))
      errors.push('Les points de plis doivent être un nombre entier.')
    else if (i.takerPoints < 0 || i.takerPoints > TRICK_TOTAL)
      errors.push(`Les points de plis doivent être compris entre 0 et ${TRICK_TOTAL}.`)
    else if (i.takerPoints === TRICK_TOTAL && !options.allowFullPoints)
      errors.push('162 points ne prouvent pas un capot : indiquez le capot séparément.')
  }
  for (const c of i.announcements)
    for (const t of ANNOUNCE_TYPES) {
      const n = c[t] ?? 0
      if (!Number.isInteger(n) || n < 0 || n > 4) errors.push('Nombre d’annonces invalide.')
    }
  if (
    rules.announcements &&
    announceCount(i.announcements[0]) > 0 &&
    announceCount(i.announcements[1]) > 0 &&
    i.strongest == null
  )
    errors.push('Les deux équipes ont des annonces : indiquez quelle équipe a la plus forte (ou égalité).')
  return errors
}

/** Équipe dont les annonces sont validées (null = aucune). */
export function validAnnounceTeam(i: BeloteInput, rules: BeloteRules): TeamIdx | null {
  if (!rules.announcements) return null
  const a = announceCount(i.announcements[0]) > 0
  const b = announceCount(i.announcements[1]) > 0
  if (a && !b) return 0
  if (b && !a) return 1
  if (!a && !b) return null
  return i.strongest === 0 || i.strongest === 1 ? i.strongest : null
}

const other = (t: TeamIdx): TeamIdx => (t === 0 ? 1 : 0)

/** Calcul d'une donne de belote (fonction pure). La réserve est gérée par game.ts. */
export function scoreBelote(
  input: BeloteInput,
  rules: BeloteRules,
  options: { allowFullPoints?: boolean } = {},
): TeamDealDetail {
  const errors = validateBeloteInput(input, rules, options)
  if (errors.length) throw new Error(errors.join(' '))
  const t = input.takerTeam
  const d = other(t)
  const exactMode = rules.rounding === 'exact'
  const base = exactMode ? 162 : 160
  const keep = (p: number) => (exactMode ? p : roundToTenHalfUp(p))
  const steps: string[] = []

  const exact: [number, number] = [0, 0]
  const capot = input.capotTeam != null
  if (!capot) {
    exact[t] = input.takerPoints
    exact[d] = TRICK_TOTAL - input.takerPoints
  }
  const belote: [number, number] = [0, 0]
  if (input.beloteTeam != null) belote[input.beloteTeam] = BELOTE_POINTS
  const validTeam = validAnnounceTeam(input, rules)
  const ann: [number, number] = [0, 0]
  if (validTeam != null) ann[validTeam] = announcePoints(input.announcements[validTeam])
  const label = (x: TeamIdx) => (x === t ? 'Preneurs' : 'Défense')

  if (rules.announcements) {
    const decl = [announcePoints(input.announcements[0]), announcePoints(input.announcements[1])]
    if (announceCount(input.announcements[0]) + announceCount(input.announcements[1]) === 0)
      steps.push('Aucune annonce.')
    else if (validTeam != null)
      steps.push(
        `Plus forte annonce : ${label(validTeam)}. Annonces validées : ${ann[validTeam]} pts (annonces de l'autre équipe éliminées).`,
      )
    else
      steps.push(
        `Égalité des plus fortes annonces : toutes les annonces s'annulent (déclarées ${decl[0]} / ${decl[1]}).`,
      )
  }
  if (input.beloteTeam != null)
    steps.push(
      `Belote-rebelote : ${label(input.beloteTeam)} (+${BELOTE_POINTS}), indépendante de la sélection des annonces.`,
    )
  steps.push(
    exactMode
      ? 'Mode points réels : aucun arrondi.'
      : 'Mode arrondi : plis arrondis à la dizaine (5 vers le haut) avant d’ajouter annonces et belote.',
  )

  const retained: [number, number] = [keep(exact[0]), keep(exact[1])]
  const totalExact: [number, number] = [exact[0] + ann[0] + belote[0], exact[1] + ann[1] + belote[1]]
  const score: [number, number] = [0, 0]
  let outcome: TeamDealDetail['outcome']
  let winner: TeamIdx | null
  let reserve: TeamDealDetail['reserveCreated'] = null

  if (capot) {
    outcome = 'capot'
    const c = input.capotTeam as TeamIdx
    winner = c
    score[c] = CAPOT_POINTS + ann[c] + belote[c]
    score[other(c)] = ann[other(c)] + belote[other(c)]
    retained[0] = retained[1] = 0
    steps.push(
      `Capot de ${label(c)} : ${CAPOT_POINTS} points. Chaque équipe conserve ses annonces validées et sa belote.`,
    )
  } else {
    steps.push(`Totaux exacts (plis + annonces + belote) : preneurs ${totalExact[t]}, défense ${totalExact[d]}.`)
    if (totalExact[t] > totalExact[d]) {
      outcome = 'success'
      winner = t
      score[0] = retained[0] + ann[0] + belote[0]
      score[1] = retained[1] + ann[1] + belote[1]
      steps.push('Contrat réussi : chaque équipe marque ses plis retenus + annonces validées + belote.')
    } else if (totalExact[t] < totalExact[d]) {
      outcome = 'fail'
      winner = d
      const allAnn = ann[0] + ann[1]
      const allBel = belote[0] + belote[1]
      score[t] = 0
      score[d] = base + allAnn + allBel
      steps.push(
        `Chute : la défense reçoit la base ${base} + annonces validées ${allAnn} + belote ${allBel} (même celle des preneurs) = ${score[d]}. Preneurs : 0.`,
      )
    } else {
      outcome = 'litige'
      winner = null
      score[d] = retained[d] + ann[d] + belote[d]
      score[t] = 0
      const total = retained[t] + ann[t] + belote[t]
      reserve = { plis: retained[t], annonces: ann[t], belote: belote[t], total }
      steps.push(
        `Litige (égalité exacte ${totalExact[t]}–${totalExact[d]}) : la défense marque ${score[d]}. Le score des preneurs (${retained[t]} plis + ${ann[t]} annonces + ${belote[t]} belote = ${total}) est mis en réserve pour la prochaine donne sans litige.`,
      )
    }
  }

  const bd = (x: TeamIdx): TeamBreakdown => ({
    exactPlis: exact[x],
    retainedPlis: retained[x],
    annonces: ann[x],
    belote: belote[x],
    exactTotal: totalExact[x],
    score: score[x],
  })
  return {
    outcome,
    winnerTeam: winner,
    multiplier: 1,
    teams: [bd(0), bd(1)],
    delta: score,
    reserveCreated: reserve,
    steps,
  }
}

export type { ReserveItem }
