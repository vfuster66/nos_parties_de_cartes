import { CONTRACTS, tarotDeclarations } from './game'
import type { TarotMatch } from './game'
import type { Seat } from '../coinche/cards'
import { discardableTarotCards, legalTarotCards } from './cards'

export type TarotView = ReturnType<typeof buildTarotView>

export function buildTarotView(game: TarotMatch, seat: Seat | null, disabled: boolean) {
  const r = game.round
  const hand = seat == null ? [] : r.hands[seat]
  const active = !disabled && seat != null && r.turn === seat
  const dogPublic = (r.contract === 'pousse' || r.contract === 'garde') && r.phase !== 'bidding'
  return {
    phase: r.phase,
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
      discard: active && r.phase === 'discard' ? discardableTarotCards(hand, 6) : [],
      canDeclare: active && r.phase === 'declare',
      declarations: active && r.phase === 'declare' ? tarotDeclarations(hand, seat === r.taker) : [],
      playable: active && r.phase === 'playing' ? legalTarotCards(hand, r.trick) : [],
      next: !disabled && seat != null && r.phase === 'summary' && !r.ready.includes(seat),
    },
  }
}
