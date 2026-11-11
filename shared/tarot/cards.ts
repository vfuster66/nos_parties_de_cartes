import { SEATS, SUITS } from '../coinche/cards'
import type { Seat, Suit } from '../coinche/cards'

const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'C', 'D', 'R'] as const
type Rank = (typeof RANKS)[number]
export type TarotCard = `${Suit}:${Rank}` | `atout:${number}` | 'excuse'
export interface TarotPlay {
  seat: Seat
  card: TarotCard
}

export type TarotPlayerCount = 3 | 4
export const nextTarotSeat = (seat: Seat, count: TarotPlayerCount): Seat => ((seat + count - 1) % count) as Seat

export const isTrump = (card: TarotCard): boolean => card.startsWith('atout:')
export const isBout = (card: TarotCard): boolean => card === 'excuse' || card === 'atout:1' || card === 'atout:21'
export const isKing = (card: TarotCard): boolean => card.endsWith(':R')

/** Les valeurs sont exprimées en demi-points pour garder des calculs entiers. */
export function halfPoints(card: TarotCard): number {
  if (isBout(card) || isKing(card)) return 9
  if (card.endsWith(':D')) return 7
  if (card.endsWith(':C')) return 5
  if (card.endsWith(':V')) return 3
  return 1
}

export function dealTarot(dealer: Seat, randomInt: (n: number) => number, count: TarotPlayerCount = 4) {
  const deck: TarotCard[] = [
    ...SUITS.flatMap((suit) => RANKS.map((rank): TarotCard => `${suit}:${rank}`)),
    ...Array.from({ length: 21 }, (_, i): TarotCard => `atout:${i + 1}`),
    'excuse',
  ]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  // Six cartes au chien, intercalées entre les paquets de trois.
  const dog: TarotCard[] = []
  const hands = SEATS.slice(0, count).map((): TarotCard[] => [])
  let seat = nextTarotSeat(dealer, count)
  for (let packet = 0; packet < 24; packet++) {
    if ([3, 7, 11, 15, 19, 23].includes(packet)) dog.push(deck.shift()!)
    hands[seat].push(...deck.splice(0, 3))
    seat = nextTarotSeat(seat, count)
  }
  return { dog, hands }
}

const suitOf = (card: TarotCard) => card.split(':')[0]
const trumpRank = (card: TarotCard) => Number(card.split(':')[1])
const suitRank = (card: TarotCard) => RANKS.indexOf(card.split(':')[1] as Rank)

/** L’Excuse ne fixe pas la couleur demandée. Les défenseurs sont aussi tenus de couper et monter. */
export function legalTarotCards(hand: readonly TarotCard[], trick: readonly TarotPlay[]): TarotCard[] {
  const lead = trick.find(({ card }) => card !== 'excuse')
  if (!lead) return [...hand]
  const led = suitOf(lead.card)
  const sameSuit = hand.filter((card) => suitOf(card) === led)
  let allowed = led !== 'atout' && sameSuit.length ? sameSuit : hand.filter(isTrump)
  if (!allowed.length) return [...hand]
  if (isTrump(allowed[0])) {
    const highest = Math.max(0, ...trick.filter(({ card }) => isTrump(card)).map(({ card }) => trumpRank(card)))
    const higher = allowed.filter((card) => trumpRank(card) > highest)
    if (higher.length) allowed = higher
  }
  return hand.includes('excuse') ? [...allowed, 'excuse'] : allowed
}

export function tarotTrickWinner(trick: readonly TarotPlay[]): Seat {
  const lead = trick.find(({ card }) => card !== 'excuse')
  if (!lead) throw new Error('Pli sans carte maîtresse')
  const led = suitOf(lead.card)
  const power = (card: TarotCard) =>
    isTrump(card) ? 100 + trumpRank(card) : suitOf(card) === led ? suitRank(card) : -1
  return trick.reduce((best, play) => (power(play.card) > power(best.card) ? play : best), lead).seat
}

export function discardableTarotCards(hand: readonly TarotCard[], count: number): TarotCard[] {
  const ordinary = hand.filter((card) => !isTrump(card) && !isKing(card) && !isBout(card))
  return ordinary.length >= count ? ordinary : [...ordinary, ...hand.filter((card) => isTrump(card) && !isBout(card))]
}
