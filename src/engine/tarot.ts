import { roundTarotGap } from './rounding'
import { TAROT_BONUS_LABELS, TAROT_CONTRACT_LABELS } from './types'
import type { TarotBonusDetail, TarotBonusType, TarotContract, TarotDealDetail, TarotRules } from './types'

export type AloneReason = 'self_call' | 'king_in_dog'

export interface TarotBonusInput {
  type: TarotBonusType
  playerId: string
  /** Chelems annoncés : nombre de plis concédés par le camp concerné. */
  tricksConceded?: number
}

export interface TarotInput {
  takerId: string
  contract: TarotContract
  /** Écart exact en valeur absolue, par pas de 0,5. */
  gap: number
  /** Contrat réussi ? Forcé à vrai si l'écart est nul. */
  success: boolean
  /** Roi appelé (cinq actifs) : joueur appelé, sinon null si le preneur joue seul. */
  calledId: string | null
  aloneReason: AloneReason | null
  bonuses: TarotBonusInput[]
}

export interface TarotContext {
  /** Joueurs inscrits, dans l'ordre de la table. */
  playerIds: string[]
  /** Donneur de cette donne. */
  dealerId: string
}

export const TAROT_CHELEM = ['petitChelem', 'grandChelem'] as const
export const TAROT_POIGNEES = ['poigneSimple', 'poigneDouble', 'poigneTriple'] as const

/** Joueurs actifs : à six inscrits, le donneur est au repos. */
export function activePlayers(ctx: TarotContext): string[] {
  return ctx.playerIds.length === 6 ? ctx.playerIds.filter((p) => p !== ctx.dealerId) : [...ctx.playerIds]
}

export function chelemSucceeded(b: TarotBonusInput, rules: TarotRules): boolean {
  const conceded = b.tricksConceded ?? 0
  return b.type === 'grandChelem' ? conceded === 0 : conceded <= rules.petitChelemMaxConceded
}

export function validateTarotInput(i: TarotInput, ctx: TarotContext, rules: TarotRules): string[] {
  const errors: string[] = []
  const active = activePlayers(ctx)
  const resting = ctx.playerIds.length === 6 ? ctx.dealerId : null
  if (!i.takerId) errors.push('Choisissez le joueur preneur.')
  else if (i.takerId === resting) errors.push('Le donneur au repos ne peut pas être preneur.')
  else if (!active.includes(i.takerId)) errors.push('Le preneur doit faire partie des joueurs actifs.')
  if (!Number.isFinite(i.gap) || i.gap < 0 || !Number.isInteger(i.gap * 2))
    errors.push('L’écart doit être un nombre positif ou nul, par pas de 0,5.')
  if (!(i.contract in rules.contractBases)) errors.push('Contrat inconnu.')
  if (active.length === 5) {
    if (i.calledId) {
      if (i.calledId === resting) errors.push('Le donneur au repos ne peut pas être appelé.')
      else if (!active.includes(i.calledId)) errors.push('L’appelé doit faire partie des joueurs actifs.')
      else if (i.calledId === i.takerId) errors.push('Pour un appel à soi-même, choisissez « Le preneur s’appelle » au lieu de nommer le preneur.')
    } else if (!i.aloneReason) {
      errors.push('À cinq joueurs, indiquez l’appelé ou le motif du jeu seul (le preneur s’appelle, ou roi au chien).')
    }
  }
  const seen = new Set<string>()
  const chelemPlayers = new Set<string>()
  for (const b of i.bonuses) {
    const name = TAROT_BONUS_LABELS[b.type]
    if (!b.playerId) errors.push(`${name} : choisissez le bénéficiaire.`)
    else if (b.playerId === resting) errors.push(`${name} : le donneur au repos ne peut pas recevoir de prime.`)
    else if (!active.includes(b.playerId)) errors.push(`${name} : le bénéficiaire doit être un joueur actif.`)
    const key = `${b.playerId}|${b.type}`
    if (seen.has(key)) errors.push(`${name} : prime en double pour le même joueur.`)
    seen.add(key)
    if ((TAROT_POIGNEES as readonly string[]).includes(b.type)) {
      const k = `${b.playerId}|poignee`
      if (seen.has(k)) errors.push('Une seule catégorie de poignée par joueur.')
      seen.add(k)
    }
    if ((TAROT_CHELEM as readonly string[]).includes(b.type)) {
      if (chelemPlayers.has(b.playerId)) errors.push('Une seule catégorie de chelem pour une même annonce.')
      chelemPlayers.add(b.playerId)
      const c = b.tricksConceded
      if (c == null || !Number.isInteger(c) || c < 0) errors.push(`${name} : indiquez le nombre de plis concédés.`)
    }
  }
  return errors
}

/** Calcul d'une donne de tarot (fonction pure). Les variations suivent l'ordre de ctx.playerIds. */
export function scoreTarot(input: TarotInput, ctx: TarotContext, rules: TarotRules): TarotDealDetail {
  const errors = validateTarotInput(input, ctx, rules)
  if (errors.length) throw new Error(errors.join(' '))
  const active = activePlayers(ctx)
  const n = active.length
  const idx = (id: string) => ctx.playerIds.indexOf(id)
  const success = input.gap === 0 ? true : input.success
  const rounded = roundTarotGap(input.gap)
  const base = rules.contractBases[input.contract]
  const value = (success ? 1 : -1) * (base + rounded)
  const steps: string[] = []
  steps.push(`Écart exact ${fmt(input.gap)} → ${success ? 'contrat réussi' : 'contrat chuté'}${input.gap === 0 ? ' (écart nul = réussi)' : ''}.`)
  steps.push(`Écart arrondi à la dizaine : ${fmt(input.gap)} → ${rounded}.`)
  steps.push(`Valeur : ${success ? '+' : '−'}(base ${TAROT_CONTRACT_LABELS[input.contract]} ${base} + écart arrondi ${rounded}) → V = ${value > 0 ? '+' : ''}${value}.`)

  // Répartition du contrat
  const contractDelta = ctx.playerIds.map(() => 0)
  const defenders = active.filter((p) => p !== input.takerId && p !== input.calledId)
  let takerMult: number
  let withPartner = false
  if (n === 3) takerMult = 2
  else if (n === 4) takerMult = 3
  else if (input.calledId) {
    takerMult = 2
    withPartner = true
  } else takerMult = 4
  contractDelta[idx(input.takerId)] = takerMult * value
  if (withPartner) contractDelta[idx(input.calledId as string)] = value
  for (const p of defenders) contractDelta[idx(p)] = -value
  steps.push(
    n === 5 && !withPartner
      ? `Preneur seul (${input.aloneReason === 'self_call' ? 's’appelle' : 'roi au chien'}) : preneur ${takerMult}V, chaque défenseur −V.`
      : withPartner
        ? 'Cinq joueurs avec partenaire : preneur 2V, appelé V, chaque défenseur −V.'
        : `Preneur ${takerMult}V, chaque défenseur −V.`,
  )

  // Primes : individuelles, indépendantes du contrat
  const bonuses: TarotBonusDetail[] = input.bonuses.map((b) => {
    const amount = rules.bonusValues[b.type]
    const ok = TAROT_CHELEM.includes(b.type as 'petitChelem') ? chelemSucceeded(b, rules) : true
    const sign = ok ? 1 : -1
    const delta = ctx.playerIds.map(() => 0)
    for (const p of active) delta[idx(p)] = p === b.playerId ? sign * amount * (n - 1) : -sign * amount
    return { type: b.type, playerId: b.playerId, succeeded: ok, amountPerPlayer: amount, delta }
  })
  for (const b of bonuses) {
    steps.push(
      `${TAROT_BONUS_LABELS[b.type]}${b.succeeded ? '' : ' (raté : transferts inversés)'} : bénéficiaire ${b.succeeded ? '+' : '−'}${b.amountPerPlayer * (n - 1)}, chaque autre joueur actif ${b.succeeded ? '−' : '+'}${b.amountPerPlayer}.`,
    )
  }
  if (ctx.playerIds.length === 6) steps.push('Donneur au repos : variation 0 pour cette donne.')

  const delta = contractDelta.map((v, k) => v + bonuses.reduce((s, b) => s + (b.delta[k] ?? 0), 0))
  return { outcome: success ? 'success' : 'fail', gap: input.gap, roundedGap: rounded, base, value, contractDelta, bonuses, delta, steps }
}

const fmt = (x: number) => String(x).replace('.', ',')

/** Aide facultative : écart signé à partir des points du preneur et du nombre de bouts. */
export const TAROT_TARGETS = [56, 51, 41, 36] as const
export function gapFromPoints(takerPoints: number, bouts: 0 | 1 | 2 | 3): { gap: number; success: boolean } {
  const diff = takerPoints - TAROT_TARGETS[bouts]
  return { gap: Math.abs(diff), success: diff >= 0 }
}
