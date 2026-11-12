import { cardPoints, cardPower, teamOf, trickWinner } from './cards'
import { halfPoints as tarotHalfPoints, isBout as isTarotBout, isTrump as isTarotTrump } from '../tarot/cards'
import type { TarotCard } from '../tarot/cards'
import type { Card, Suit } from './cards'
import type { RoomView } from './views'

export type BotIntent = { type: string; [key: string]: unknown }

const SUITS: Suit[] = ['pique', 'coeur', 'trefle', 'carreau']
function takeStrength(hand: Card[], suit: Suit): number {
  const trump = hand.filter((card) => card.suit === suit)
  const trumpValue: Record<Card['rank'], number> = {
    '7': 0.1,
    '8': 0.2,
    '9': 4.5,
    '10': 1.8,
    V: 6.2,
    D: 0.5,
    R: 0.7,
    A: 3.1,
  }
  const sideValue: Record<Card['rank'], number> = {
    '7': 0,
    '8': 0,
    '9': 0,
    '10': 0.5,
    V: 0,
    D: 0,
    R: 0.2,
    A: 2.4,
  }
  return (
    trump.length * 1.15 +
    trump.reduce((sum, card) => sum + trumpValue[card.rank], 0) +
    hand.filter((card) => card.suit !== suit).reduce((sum, card) => sum + sideValue[card.rank], 0)
  )
}

function playCard(view: RoomView, playable: Card[]): Card {
  const round = view.round!
  const trump = round.contract!.suit
  const trick = round.trick
  if (!trick.length) {
    const sideAces = playable.filter((card) => card.suit !== trump && card.rank === 'A')
    if (sideAces.length) return sideAces[0]
    const trumpCards = playable.filter((card) => card.suit === trump)
    const isTaker = view.you.seat != null && teamOf(view.you.seat) === teamOf(round.contract!.seat)
    if (isTaker && trumpCards.length >= 3) {
      return [...trumpCards].sort((a, b) => cardPower(b, trump, trump) - cardPower(a, trump, trump))[0]
    }
    return [...playable].sort((a, b) => cardPoints(a, trump) - cardPoints(b, trump))[0]
  }

  const led = trick[0].card.suit
  const winner = trickWinner(trick, trump)
  const winningCard = trick.find((entry) => entry.seat === winner)!.card
  const winningPower = cardPower(winningCard, trump, led)
  const partnerWinning = view.you.seat != null && teamOf(winner) === teamOf(view.you.seat)
  if (partnerWinning) {
    // Ne gaspiller ni points ni atouts maîtres quand le partenaire tient déjà le pli.
    return [...playable].sort(
      (a, b) => cardPoints(a, trump) - cardPoints(b, trump) || cardPower(a, trump, led) - cardPower(b, trump, led),
    )[0]
  }

  const winners = playable.filter((card) => cardPower(card, trump, led) > winningPower)
  if (winners.length) {
    // Si le pli est prenable, fournir la carte la moins chère qui bat la carte maîtresse.
    return [...winners].sort(
      (a, b) => cardPoints(a, trump) - cardPoints(b, trump) || cardPower(a, trump, led) - cardPower(b, trump, led),
    )[0]
  }
  // Sinon, se défausser de la carte qui évitera de laisser des points dans un pli perdu.
  return [...playable].sort(
    (a, b) => cardPoints(b, trump) - cardPoints(a, trump) || cardPower(b, trump, led) - cardPower(a, trump, led),
  )[0]
}

function tarotStrength(hand: TarotCard[]): number {
  const trumps = hand.filter(isTarotTrump).length
  const bouts = hand.filter(isTarotBout).length
  const kings = hand.filter((card) => card.endsWith(':R')).length
  return trumps + bouts * 2.5 + kings * 1.25
}

function discardValue(card: TarotCard): number {
  if (isTarotBout(card)) return 100
  if (isTarotTrump(card)) return 50 + Number(card.split(':')[1])
  return tarotHalfPoints(card)
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
    return { type: 'playCard', card: playCard(view, a.playable) }
  }
  if (a.canReadyNext) return { type: 'nextRound' }
  if (a.canSurcoinche) {
    const strength = takeStrength(view.hand, view.round?.contract?.suit ?? SUITS[0])
    if (strength >= 14) return { type: 'surcoinche' }
    if (a.canAcceptCoinche) return { type: 'acceptCoinche' }
  }
  if (a.canAcceptCoinche) return { type: 'acceptCoinche' }
  if (a.coinche && takeStrength(view.hand, view.round?.contract?.suit ?? SUITS[0]) >= 13)
    return { type: 'coinche', contractRef: a.coinche.contractRef }
  if (a.takeSuits.length) {
    const suit = [...a.takeSuits].sort((x, y) => takeStrength(view.hand, y) - takeStrength(view.hand, x))[0]
    const threshold = view.hand.length <= 5 ? (view.round?.beloteDeal?.pass === 2 ? 5.2 : 4.8) : 9.5
    if (takeStrength(view.hand, suit) >= threshold) return { type: 'take', suit }
    return { type: 'pass' }
  }
  if (a.bid) {
    const suit = [...SUITS].sort((x, y) => takeStrength(view.hand, y) - takeStrength(view.hand, x))[0]
    if (takeStrength(view.hand, suit) >= 9.5) return { type: 'bid', value: a.bid.min, suit }
    return { type: 'pass' }
  }
  return a.canPass ? { type: 'pass' } : null
}
