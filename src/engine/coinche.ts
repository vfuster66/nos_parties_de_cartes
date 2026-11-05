import { roundToTenHalfUp } from './rounding'
import type { CoincheRules, Suit, TeamBreakdown, TeamDealDetail, TeamIdx } from './types'

export type CoincheLevel = 'none' | 'coinche' | 'surcoinche'

export interface CoincheInput {
  takerId: string
  takerTeam: TeamIdx
  /** Contrat numérique ou capot annoncé. */
  contract: number | 'capot'
  trump: Suit
  level: CoincheLevel
  /** Équipe (et joueur, facultatif) ayant coinché. */
  coincheTeam?: TeamIdx | null
  coincherId?: string | null
  /** Points de plis exacts des preneurs (dernier de der inclus, belote exclue). */
  takerPoints: number
  /** Les preneurs ont remporté tous les plis. */
  allTricks: boolean
  /** Équipe détentrice de la belote-rebelote. */
  beloteTeam: TeamIdx | null
}

export const COINCHE_MIN_CONTRACT = 80
export const COINCHE_MAX_CONTRACT = 160
export const BELOTE_POINTS = 20
export const CAPOT_POINTS = 250
export const TRICK_TOTAL = 162

export const multiplierOf = (l: CoincheLevel): number => (l === 'surcoinche' ? 3 : l === 'coinche' ? 2 : 1)

export function validateCoincheInput(i: CoincheInput): string[] {
  const errors: string[] = []
  if (!i.takerId) errors.push('Choisissez le joueur preneur.')
  if (i.contract !== 'capot') {
    if (!Number.isFinite(i.contract) || !Number.isInteger(i.contract))
      errors.push('Le contrat doit être un nombre entier.')
    else if (i.contract < COINCHE_MIN_CONTRACT || i.contract > COINCHE_MAX_CONTRACT || i.contract % 10 !== 0)
      errors.push(`Le contrat doit être un multiple de 10 entre ${COINCHE_MIN_CONTRACT} et ${COINCHE_MAX_CONTRACT}.`)
  }
  if (!i.allTricks) {
    if (!Number.isFinite(i.takerPoints) || !Number.isInteger(i.takerPoints))
      errors.push('Les points de plis doivent être un nombre entier.')
    else if (i.takerPoints < 0 || i.takerPoints > TRICK_TOTAL)
      errors.push(`Les points de plis doivent être compris entre 0 et ${TRICK_TOTAL}.`)
    else if (i.takerPoints === TRICK_TOTAL)
      errors.push('162 points ne prouvent pas un capot : cochez « Capot réalisé » si tous les plis sont gagnés.')
  }
  if (i.level === 'none' && i.coincheTeam != null) errors.push("L'équipe qui coinche n'a pas de sens sans coinche.")
  if (i.coincheTeam != null && i.coincheTeam === i.takerTeam)
    errors.push('Les preneurs ne peuvent pas coincher leur propre contrat.')
  return errors
}

const other = (t: TeamIdx): TeamIdx => (t === 0 ? 1 : 0)

/** Calcul d'une donne de coinche (fonction pure). */
export function scoreCoinche(input: CoincheInput, rules: CoincheRules): TeamDealDetail {
  const errors = validateCoincheInput(input)
  if (errors.length) throw new Error(errors.join(' '))
  const t = input.takerTeam
  const d = other(t)
  const mult = multiplierOf(input.level)
  const exactMode = rules.rounding === 'exact'
  const base = exactMode ? 162 : 160
  const steps: string[] = []

  const takerExact = input.allTricks ? TRICK_TOTAL : input.takerPoints
  const defExact = input.allTricks ? 0 : TRICK_TOTAL - input.takerPoints
  const keep = (p: number) => (exactMode ? p : roundToTenHalfUp(p))
  const belote: [number, number] = [0, 0]
  if (input.beloteTeam != null) belote[input.beloteTeam] = BELOTE_POINTS

  const label = (x: TeamIdx) => (x === t ? 'Preneurs' : 'Défense')
  steps.push(
    input.allTricks
      ? 'Les preneurs ont remporté tous les plis (capot).'
      : `Plis exacts : preneurs ${takerExact}, défense ${defExact} (complément à ${TRICK_TOTAL}).`,
  )
  if (input.beloteTeam != null) steps.push(`Belote-rebelote (+${BELOTE_POINTS}, jamais multipliée) : ${label(input.beloteTeam)}.`)
  steps.push(
    exactMode ? 'Mode points réels : aucun arrondi.' : 'Mode arrondi : plis arrondis à la dizaine (5 vers le haut), séparément.',
  )
  if (mult > 1) steps.push(`Multiplicateur ×${mult} (${input.level === 'coinche' ? 'coinché' : 'surcoinché'}).`)

  const score: [number, number] = [0, 0]
  let outcome: TeamDealDetail['outcome']
  let winner: TeamIdx
  const retained: [number, number] = [0, 0]
  retained[t] = keep(takerExact)
  retained[d] = keep(defExact)

  const announcedCapot = input.contract === 'capot'
  if (input.allTricks) {
    outcome = 'capot'
    winner = t
    const capotBase = announcedCapot ? CAPOT_POINTS + CAPOT_POINTS : CAPOT_POINTS + (input.contract as number)
    score[t] = capotBase * mult + belote[t]
    score[d] = belote[d]
    steps.push(
      announcedCapot
        ? `Capot annoncé et réalisé : ${CAPOT_POINTS} + ${CAPOT_POINTS} = ${capotBase}${mult > 1 ? ` × ${mult}` : ''}.`
        : `Capot non annoncé : ${CAPOT_POINTS} + contrat ${input.contract} = ${capotBase}${mult > 1 ? ` × ${mult}` : ''}.`,
    )
  } else if (announcedCapot) {
    outcome = 'fail'
    winner = d
    const v = (base + CAPOT_POINTS) * mult
    score[t] = belote[t]
    score[d] = v + belote[d]
    steps.push(`Capot annoncé chuté (un pli concédé) : défense (${base} + ${CAPOT_POINTS})${mult > 1 ? ` × ${mult}` : ''} = ${v}.`)
  } else {
    const contract = input.contract as number
    const takerTotal = takerExact + belote[t]
    const ok = takerTotal >= contract
    steps.push(
      `Réussite jugée sur les points exacts : ${takerExact}${belote[t] ? ` + belote ${BELOTE_POINTS}` : ''} = ${takerTotal} ${ok ? '≥' : '<'} contrat ${contract}.`,
    )
    if (ok) {
      outcome = 'success'
      winner = t
      score[t] = (retained[t] + contract) * mult + belote[t]
      score[d] = retained[d] + belote[d]
      steps.push(`Preneurs : (${retained[t]} + ${contract})${mult > 1 ? ` × ${mult}` : ''} = ${(retained[t] + contract) * mult}. Défense : ${retained[d]} (non multipliés).`)
    } else {
      outcome = 'fail'
      winner = d
      const v = (base + contract) * mult
      score[t] = belote[t]
      score[d] = v + belote[d]
      steps.push(`Chute : défense (${base} + ${contract})${mult > 1 ? ` × ${mult}` : ''} = ${v}. Preneurs : 0.`)
    }
  }
  if (belote[0] + belote[1] > 0) steps.push('La belote est ajoutée une seule fois au score final de son propriétaire.')

  const bd = (x: TeamIdx): TeamBreakdown => ({
    exactPlis: x === t ? takerExact : defExact,
    retainedPlis: retained[x],
    annonces: 0,
    belote: belote[x],
    exactTotal: (x === t ? takerExact : defExact) + belote[x],
    score: score[x],
  })
  return {
    outcome,
    winnerTeam: winner,
    multiplier: mult,
    teams: [bd(0), bd(1)],
    delta: score,
    reserveCreated: null,
    steps,
  }
}
