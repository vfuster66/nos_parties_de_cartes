import type { CoincheInput } from './coinche'
import type { BeloteInput } from './belote'
import type { TarotInput } from './tarot'
import type { Game, Deal } from './model'
import { SUIT_LABELS, TAROT_CONTRACT_LABELS } from './types'

export interface Names {
  player: (id: string) => string
  /** Nom d'une équipe de la partie (0 ou 1). */
  team: (idx: 0 | 1) => string
}

/** Libellé lisible d'une donne pour l'historique. */
export function describeDeal(g: Game, d: Deal, n: Names): string {
  if (d.passed || !d.input) return 'Donne passée (aucun point)'
  if (g.kind === 'tarot') {
    const i = d.input as TarotInput
    let s = `${n.player(i.takerId)} — ${TAROT_CONTRACT_LABELS[i.contract]}`
    if (g.playerIds.length >= 5) {
      if (i.calledId) s += ` — appelle ${n.player(i.calledId)}`
      else s += i.aloneReason === 'king_in_dog' ? ' — seul (roi au chien)' : ' — s’appelle'
    }
    return s
  }
  const i = d.input as CoincheInput | BeloteInput
  const team = n.team(i.takerTeam)
  if (g.kind === 'belote') return `${n.player(i.takerId)} — ${team} — prise à ${SUIT_LABELS[i.trump]}`
  const c = i as CoincheInput
  const contract = c.contract === 'capot' ? 'capot' : String(c.contract)
  const lvl = c.level === 'coinche' ? ', coinché' : c.level === 'surcoinche' ? ', surcoinché' : ''
  return `${n.player(c.takerId)} — ${team} — ${contract} à ${SUIT_LABELS[c.trump]}${lvl}`
}
