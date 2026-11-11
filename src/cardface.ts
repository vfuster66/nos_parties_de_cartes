// Face d'une carte à dessiner, commune à la coinche/belote (32 cartes) et au tarot (78 cartes).
import type { Card } from '../shared/coinche/cards'
import type { TarotCard } from '../shared/tarot/cards'
import { SUIT_LABELS, SUIT_SYMBOLS } from './engine/types'
import type { Suit } from './engine/types'

export type Face = { kind: 'suit'; suit: Suit; rank: string } | { kind: 'trump'; n: number } | { kind: 'excuse' }

export const faceOfCard = (c: Card): Face => ({ kind: 'suit', suit: c.suit, rank: c.rank })
export function faceOfTarot(card: TarotCard): Face {
  if (card === 'excuse') return { kind: 'excuse' }
  const [suit, rank] = card.split(':')
  return suit === 'atout' ? { kind: 'trump', n: Number(rank) } : { kind: 'suit', suit: suit as Suit, rank }
}
export const isRedSuit = (s: Suit): boolean => s === 'coeur' || s === 'carreau'

const RANK_NAMES: Record<string, string> = { V: 'Valet', C: 'Cavalier', D: 'Dame', R: 'Roi', A: 'As' }
export function faceName(f: Face): string {
  if (f.kind === 'excuse') return 'Excuse'
  if (f.kind === 'trump') return `Atout ${f.n}`
  return `${RANK_NAMES[f.rank] ?? f.rank} de ${SUIT_LABELS[f.suit]}`
}
export const faceSymbol = (f: Face): string =>
  f.kind === 'suit' ? SUIT_SYMBOLS[f.suit] : f.kind === 'excuse' ? '★' : ''
