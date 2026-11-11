// Cartes, ordre et valeurs de la coinche en ligne. Fonctions pures, sans dépendance Node ni Vue.
import type { Suit } from '../../src/engine/types'

export type { Suit }
export const SUITS: readonly Suit[] = ['pique', 'coeur', 'trefle', 'carreau']
export const RANKS = ['7', '8', '9', '10', 'V', 'D', 'R', 'A'] as const
export type Rank = (typeof RANKS)[number]
export interface Card {
  suit: Suit
  rank: Rank
}
export type Seat = 0 | 1 | 2 | 3
export type TeamIdx = 0 | 1
export const SEATS: readonly Seat[] = [0, 1, 2, 3]

/** Ordre croissant à l'atout : 7, 8, dame, roi, 10, as, 9, valet. */
const TRUMP_ORDER: readonly Rank[] = ['7', '8', 'D', 'R', '10', 'A', '9', 'V']
/** Ordre croissant hors atout : 7, 8, 9, valet, dame, roi, 10, as. */
const PLAIN_ORDER: readonly Rank[] = ['7', '8', '9', 'V', 'D', 'R', '10', 'A']
const TRUMP_POINTS: Record<Rank, number> = { V: 20, '9': 14, A: 11, '10': 10, R: 4, D: 3, '8': 0, '7': 0 }
const PLAIN_POINTS: Record<Rank, number> = { A: 11, '10': 10, R: 4, D: 3, V: 2, '9': 0, '8': 0, '7': 0 }

export const LAST_TRICK_BONUS = 10
export const TOTAL_POINTS = 162

export const nextSeat = (s: Seat): Seat => ((s + 1) % 4) as Seat
export const partnerOf = (s: Seat): Seat => ((s + 2) % 4) as Seat
export const teamOf = (s: Seat): TeamIdx => (s % 2) as TeamIdx
export const cardKey = (c: Card): string => `${c.suit}:${c.rank}`
export const sameCard = (a: Card, b: Card): boolean => a.suit === b.suit && a.rank === b.rank

export function fullDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank })
  return deck
}

export function cardPoints(c: Card, trump: Suit): number {
  return (c.suit === trump ? TRUMP_POINTS : PLAIN_POINTS)[c.rank]
}

/** Force d'une carte dans un pli dont la couleur demandée est `led`. -1 : ne peut pas gagner. */
export function cardPower(c: Card, trump: Suit, led: Suit): number {
  if (c.suit === trump) return 100 + TRUMP_ORDER.indexOf(c.rank)
  if (c.suit === led) return PLAIN_ORDER.indexOf(c.rank)
  return -1
}

export interface TrickCard {
  seat: Seat
  card: Card
}

/** Place gagnant le pli (même incomplet : « qui est maître pour l'instant »). */
export function trickWinner(trick: readonly TrickCard[], trump: Suit): Seat {
  if (!trick.length) throw new Error('Pli vide')
  const led = trick[0].card.suit
  let best = trick[0]
  for (const t of trick.slice(1)) if (cardPower(t.card, trump, led) > cardPower(best.card, trump, led)) best = t
  return best.seat
}

export const trickPoints = (trick: readonly TrickCard[], trump: Suit): number =>
  trick.reduce((s, t) => s + cardPoints(t.card, trump), 0)

/** Mélange de Fisher-Yates sans biais. `randomInt(n)` renvoie un entier uniforme dans [0, n). */
export function shuffleDeck(randomInt: (maxExclusive: number) => number): Card[] {
  const deck = fullDeck()
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Source aléatoire invalide')
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

/** Huit cartes par place. */
export function dealHands(deck: readonly Card[]): Card[][] {
  if (deck.length !== 32) throw new Error('Il faut 32 cartes')
  return [0, 1, 2, 3].map((s) => deck.slice(s * 8, s * 8 + 8))
}

/** Tri d'affichage : atout d'abord, alternance noir/rouge, puis force décroissante. */
export function sortHand(hand: readonly Card[], trump: Suit | null): Card[] {
  const present = new Set(hand.map((card) => card.suit))
  const isRed = (suit: Suit) => suit === 'coeur' || suit === 'carreau'
  const remaining = SUITS.filter((suit) => present.has(suit) && suit !== trump)
  const red = remaining.filter(isRed)
  const black = remaining.filter((suit) => !isRed(suit))
  const suitOrder: Suit[] = trump && present.has(trump) ? [trump] : []
  let preferRed = suitOrder.length ? !isRed(suitOrder[0]) : red.length > black.length
  while (red.length || black.length) {
    const suit = (preferRed ? (red.shift() ?? black.shift()) : (black.shift() ?? red.shift()))!
    suitOrder.push(suit)
    preferRed = !isRed(suit)
  }
  return [...hand].sort((a, b) => {
    if (a.suit !== b.suit) return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit)
    const order = a.suit === trump ? TRUMP_ORDER : PLAIN_ORDER
    return order.indexOf(b.rank) - order.indexOf(a.rank)
  })
}

export const hasBelote = (hand: readonly Card[], trump: Suit): boolean =>
  hand.some((c) => c.suit === trump && c.rank === 'R') && hand.some((c) => c.suit === trump && c.rank === 'D')
