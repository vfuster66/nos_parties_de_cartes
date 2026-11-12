import { halfPoints, isBout, isTrump } from '../tarot/cards'
import type { TarotCard } from '../tarot/cards'
import type { Card, Suit } from './cards'
import type { RoomView } from './views'

export type BotIntent = { type: string; [key: string]: unknown }

const SUITS: Suit[] = ['pique', 'coeur', 'trefle', 'carreau']
const cardValue: Record<Card['rank'], number> = { '7': 0, '8': 1, '9': 2, '10': 3, V: 4, D: 5, R: 6, A: 7 }

function takeStrength(hand: Card[], suit: Suit): number {
  const cards = hand.filter((card) => card.suit === suit)
  return (
    cards.length * 2 +
    cards.reduce((n, card) => n + (card.rank === 'V' ? 3 : card.rank === '9' ? 2 : card.rank === 'A' ? 1 : 0), 0)
  )
}

function tarotStrength(hand: TarotCard[]): number {
  const trumps = hand.filter(isTrump).length
  const bouts = hand.filter(isBout).length
  const kings = hand.filter((card) => card.endsWith(':R')).length
  return trumps + bouts * 2.5 + kings * 1.25
}

function discardValue(card: TarotCard): number {
  if (isBout(card)) return 100
  if (isTrump(card)) return 50 + Number(card.split(':')[1])
  return halfPoints(card)
}

/** Choisit une action parmi celles validées et publiées pour le joueur automatique. */
export function nextBotIntent(view: RoomView, randomInt: (n: number) => number): BotIntent | null {
  if (view.status !== 'playing' || view.pause) return null

  const tarot = view.tarot
  if (tarot) {
    const a = tarot.actions
    if (a.playable.length) return { type: 'tarotPlay', card: a.playable[randomInt(a.playable.length)] }
    if (a.next) return { type: 'nextRound' }
    if (a.discard.length) {
      const count = tarot.dogSize
      return {
        type: 'tarotDiscard',
        cards: [...a.discard].sort((x, y) => discardValue(x) - discardValue(y)).slice(0, count),
      }
    }
    if (a.calls.length) {
      const king = a.calls.find((card) => card.endsWith(':R'))
      return { type: 'tarotCall', card: king ?? a.calls[0] }
    }
    if (a.canDeclare) return { type: 'tarotDeclare', types: [], shown: [] }
    if (a.bids.length) {
      if (tarotStrength(tarot.hand) >= 9) return { type: 'tarotBid', contract: a.bids[0] }
      return a.canPass ? { type: 'pass' } : null
    }
    return a.canPass ? { type: 'pass' } : null
  }

  const a = view.actions
  if (a.playable.length && view.round?.contract) {
    const trump = view.round.contract.suit
    const cards = [...a.playable].sort((x, y) => {
      const points = (card: Card) =>
        card.suit === trump
          ? { V: 20, '9': 14, A: 11, '10': 10, R: 4, D: 3, '8': 0, '7': 0 }[card.rank]
          : { A: 11, '10': 10, R: 4, D: 3, V: 2, '9': 0, '8': 0, '7': 0 }[card.rank]
      return points(x) - points(y) || cardValue[x.rank] - cardValue[y.rank]
    })
    return { type: 'playCard', card: cards[0] }
  }
  if (a.canReadyNext) return { type: 'nextRound' }
  if (a.canSurcoinche) return { type: 'surcoinche' }
  if (a.canAcceptCoinche) return { type: 'acceptCoinche' }
  if (a.coinche && view.hand.filter((card) => card.suit === view.round?.contract?.suit).length >= 5)
    return { type: 'coinche', contractRef: a.coinche.contractRef }
  if (a.takeSuits.length) {
    const suit = [...a.takeSuits].sort((x, y) => takeStrength(view.hand, y) - takeStrength(view.hand, x))[0]
    if (takeStrength(view.hand, suit) >= 8) return { type: 'take', suit }
    return { type: 'pass' }
  }
  if (a.bid) {
    const suit = [...SUITS].sort((x, y) => takeStrength(view.hand, y) - takeStrength(view.hand, x))[0]
    if (takeStrength(view.hand, suit) >= 14) return { type: 'bid', value: a.bid.min, suit }
    return { type: 'pass' }
  }
  return a.canPass ? { type: 'pass' } : null
}
