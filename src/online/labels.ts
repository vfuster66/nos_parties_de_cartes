import type { Card, Seat, Suit } from '../../shared/coinche/cards'
import type { BidEntry, Contract } from '../../shared/coinche/types'
import type { RoomView } from '../../shared/coinche/views'
import { SUIT_LABELS, SUIT_SYMBOLS } from '../engine/types'

export const RANK_LABELS: Record<Card['rank'], string> = {
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  V: 'Valet',
  D: 'Dame',
  R: 'Roi',
  A: 'As',
}
export const RANK_SHORT: Record<Card['rank'], string> = {
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  V: 'V',
  D: 'D',
  R: 'R',
  A: 'A',
}
export const cardName = (c: Card): string => `${RANK_LABELS[c.rank]} de ${SUIT_LABELS[c.suit]}`
export const isRed = (s: Suit): boolean => s === 'coeur' || s === 'carreau'
export const suitText = (s: Suit): string => `${SUIT_SYMBOLS[s]} ${SUIT_LABELS[s]}`

export const contractValue = (c: Contract | null): string =>
  c ? (c.value === 'capot' ? 'Capot' : c.value === 'prise' ? 'Prise à' : String(c.value)) : '—'
export const contractText = (c: Contract | null): string => (c ? `${contractValue(c)} ${SUIT_SYMBOLS[c.suit]}` : '—')
export const levelText = (l: 'none' | 'coinche' | 'surcoinche'): string =>
  l === 'surcoinche' ? 'surcoinché ×3' : l === 'coinche' ? 'coinché ×2' : ''

export function nameOfSeat(v: RoomView, seat: Seat): string {
  const pid = v.seats[seat]
  return v.participants.find((p) => p.id === pid)?.nickname ?? `Place ${seat + 1}`
}

export function bidText(v: RoomView, b: BidEntry): string {
  const who = nameOfSeat(v, b.seat)
  switch (b.kind) {
    case 'pass':
      return `${who} passe`
    case 'take':
      return `${who} prend à ${suitText(b.suit)}`
    case 'bid':
      return `${who} annonce ${b.value} ${SUIT_SYMBOLS[b.suit]}`
    case 'capot':
      return `${who} annonce capot à ${SUIT_SYMBOLS[b.suit]} ${SUIT_LABELS[b.suit]}`
    case 'coinche':
      return `${who} coinche`
    case 'surcoinche':
      return `${who} surcoinche`
    case 'accept':
      return `${who} accepte la coinche`
  }
}

export const teamName = (v: RoomView, t: 0 | 1): string => v.config.teamNames[t]
/** Position relative à moi : 0 bas (moi), 1 gauche, 2 haut (partenaire), 3 droite. */
export const relPos = (mySeat: Seat, seat: Seat): 0 | 1 | 2 | 3 => ((seat - mySeat + 4) % 4) as 0 | 1 | 2 | 3
