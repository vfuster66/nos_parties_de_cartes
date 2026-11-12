import { cardPoints, cardPower, partnerOf, teamOf, trickWinner } from './cards'
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

function playCard(view: RoomView, playable: Card[], difficulty: number, randomInt: (n: number) => number): Card {
  const round = view.round!
  const trump = round.contract!.suit
  const trick = round.trick
  // Aux niveaux bas, les bots jouent plus simplement et gardent davantage leurs cartes fortes.
  const simplePlayChance = difficulty === 1 ? 55 : difficulty === 2 ? 25 : 0
  if (simplePlayChance > 0 && playable.length > 1 && randomInt(100) < simplePlayChance) {
    const lowCards = [...playable]
      .sort(
        (a, b) =>
          cardPoints(a, trump) - cardPoints(b, trump) || cardPower(a, trump, trump) - cardPower(b, trump, trump),
      )
      .slice(0, Math.max(1, Math.ceil(playable.length / 2)))
    return lowCards[randomInt(lowCards.length)]
  }
  if (!trick.length) {
    const signal = round.callSignal
    if (signal && view.you.seat != null && partnerOf(signal.caller) === view.you.seat) {
      const calledSuit = playable.filter((card) => card.suit === signal.suit)
      if (calledSuit.length) return [...calledSuit].sort((a, b) => cardPoints(a, trump) - cardPoints(b, trump))[0]
    }
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

function signalRaise(hand: Card[], suit: Suit): number {
  const hasTopTrump = hand.some((card) => card.suit === suit && (card.rank === 'V' || card.rank === '9'))
  const aces = hand.filter((card) => card.rank === 'A').length
  if (aces >= 2 || (hasTopTrump && aces >= 1)) return 20
  if (hasTopTrump || aces === 1) return 10
  return 10
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
  const difficulty = view.config.game === 'coinche' ? Math.max(1, Math.min(5, view.config.botDifficulty ?? 2)) : 3
  if (a.playable.length && view.round?.contract) {
    return { type: 'playCard', card: playCard(view, a.playable, difficulty, randomInt) }
  }
  if (a.canReadyNext) return { type: 'nextRound' }
  if (a.canSurcoinche) {
    const strength = takeStrength(view.hand, view.round?.contract?.suit ?? SUITS[0])
    if (strength >= [19, 17, 15, 14, 13][difficulty - 1]) return { type: 'surcoinche' }
    if (a.canAcceptCoinche) return { type: 'acceptCoinche' }
  }
  if (a.canAcceptCoinche) return { type: 'acceptCoinche' }
  if (
    a.coinche &&
    takeStrength(view.hand, view.round?.contract?.suit ?? SUITS[0]) >= [18, 16, 14, 12, 11][difficulty - 1]
  )
    return { type: 'coinche', contractRef: a.coinche.contractRef }
  if (a.takeSuits.length) {
    const suit = [...a.takeSuits].sort((x, y) => takeStrength(view.hand, y) - takeStrength(view.hand, x))[0]
    const threshold =
      view.hand.length <= 5
        ? [7.4, 6.2, 4.8, 4.6, 4.1][difficulty - 1] + (view.round?.beloteDeal?.pass === 2 ? 0.4 : 0)
        : [14.5, 12, 9.5, 8.5, 7.5][difficulty - 1]
    if (takeStrength(view.hand, suit) >= threshold) return { type: 'take', suit }
    return { type: 'pass' }
  }
  if (a.bid) {
    const current = view.round?.contract
    const seat = view.you.seat
    if (
      current &&
      typeof current.value === 'number' &&
      seat != null &&
      current.seat !== seat &&
      teamOf(current.seat) === teamOf(seat)
    ) {
      const currentStrength = takeStrength(view.hand, current.suit)
      const extra = signalRaise(view.hand, current.suit)
      const value = current.value + extra
      const supportThreshold = [9.5, 8, 6, 5.5, 5][difficulty - 1]
      const hasAce = view.hand.some((card) => card.rank === 'A')
      const strongSupport =
        view.hand.filter((card) => card.rank === 'A').length >= 2 ||
        (hasAce && view.hand.some((card) => card.suit === current.suit && (card.rank === 'V' || card.rank === '9')))
      const canSupport =
        difficulty === 3
          ? currentStrength >= 6 || hasAce
          : currentStrength >= supportThreshold && (difficulty > 1 || strongSupport)
      if (canSupport) {
        if (value <= a.bid.max) return { type: 'bid', value, suit: current.suit }
      }
    }
    const suit = [...SUITS].sort((x, y) => takeStrength(view.hand, y) - takeStrength(view.hand, x))[0]
    if (takeStrength(view.hand, suit) >= [14.5, 12, 9.5, 8.5, 7.5][difficulty - 1])
      return { type: 'bid', value: a.bid.min, suit }
    return { type: 'pass' }
  }
  return a.canPass ? { type: 'pass' } : null
}
