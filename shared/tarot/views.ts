import { CONTRACTS, HANDFUL_SIZES, playableTarotCards, tarotCalls, tarotDeclarations } from './game'
import type { TarotMatch } from './game'
import type { Seat } from '../coinche/cards'
import { activeTarotCount, discardableTarotCards, tarotHandSize } from './cards'

import type { TarotPlayerCount } from './cards'

export type TarotView = ReturnType<typeof buildTarotView>

export function buildTarotView(game: TarotMatch, seat: Seat | null, disabled: boolean) {
  const r = game.round
  const playerCount = game.totals.length as TarotPlayerCount
  const hand = seat == null ? [] : r.hands[seat]
  const active = !disabled && seat != null && r.turn === seat
  const dogPublic = (r.contract === 'pousse' || r.contract === 'garde') && r.phase !== 'bidding'
  return {
    phase: r.phase,
    trickLimit: tarotHandSize(playerCount),
    handfulSizes: HANDFUL_SIZES[activeTarotCount(playerCount)],
    dogSize: r.dog.length,
    restingSeat: playerCount === 6 ? r.dealer : null,
    calledCard: r.calledCard ?? null,
    partner:
      r.phase === 'summary' ||
      (r.calledCard &&
        (r.trick.some(({ card }) => card === r.calledCard) ||
          r.tricks.some(({ plays }) => plays.some(({ card }) => card === r.calledCard))))
        ? (r.partner ?? null)
        : null,
    dealer: r.dealer,
    turn: r.turn,
    taker: r.taker,
    contract: r.contract,
    totals: [...game.totals],
    completed: structuredClone(game.completed),
    bids: structuredClone(r.bids),
    dog: dogPublic ? [...r.dog] : [],
    shownDiscard: r.discard.filter((card) => card.startsWith('atout:')),
    hand: [...hand],
    trick: structuredClone(r.trick),
    lastTrick: structuredClone(r.tricks.at(-1) ?? null),
    trickCount: r.tricks.length,
    declarations: structuredClone(r.declarations),
    detail: structuredClone(r.detail),
    ready: [...r.ready],
    actions: {
      canPass: active && r.phase === 'bidding',
      bids: active && r.phase === 'bidding' ? CONTRACTS.slice(r.contract ? CONTRACTS.indexOf(r.contract) + 1 : 0) : [],
      calls: active && r.phase === 'call' ? tarotCalls(hand) : [],
      discard: active && r.phase === 'discard' ? discardableTarotCards(hand, r.dog.length) : [],
      canDeclare: active && r.phase === 'declare',
      declarations: active && r.phase === 'declare' ? tarotDeclarations(hand, seat === r.taker, playerCount) : [],
      playable: active && r.phase === 'playing' ? playableTarotCards(r, seat!) : [],
      next: !disabled && seat != null && r.phase === 'summary' && !r.ready.includes(seat),
    },
  }
}
