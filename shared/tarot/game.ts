import { defaultRules } from '../../src/engine/types'
import type { TarotBonusType, TarotContract, TarotDealDetail, TarotRules } from '../../src/engine/types'
import { gapFromPoints, scoreTarot } from '../../src/engine/tarot'
import type { TarotBonusInput } from '../../src/engine/tarot'
import type { Seat } from '../coinche/cards'
import { RuleError } from '../coinche/types'
import type { Command } from '../protocol'
import {
  activeTarotCount,
  dealTarot,
  discardableTarotCards,
  halfPoints,
  isBout,
  isTrump,
  legalTarotCards,
  nextTarotPlayer,
  nextTarotSeat,
  tarotHandSize,
  SUIT_CALL_RANKS,
  tarotCallCards,
  tarotTrickWinner,
} from './cards'
import type { TarotCard, TarotPlay, TarotPlayerCount } from './cards'

export const CONTRACTS: readonly TarotContract[] = ['pousse', 'garde', 'gardeSans', 'gardeContre']
export const HANDFUL_SIZES = {
  3: { poigneSimple: 13, poigneDouble: 15, poigneTriple: 18 },
  4: { poigneSimple: 10, poigneDouble: 13, poigneTriple: 15 },
  5: { poigneSimple: 8, poigneDouble: 10, poigneTriple: 13 },
} as const

type Declaration = Exclude<TarotBonusType, 'petitAuBout'>

interface CompletedTrick {
  plays: TarotPlay[]
  winner: Seat
}

export interface TarotRound {
  dealer: Seat
  turn: Seat
  phase: 'bidding' | 'call' | 'discard' | 'declare' | 'playing' | 'summary'
  hands: TarotCard[][]
  dog: TarotCard[]
  discard: TarotCard[]
  bids: { seat: Seat; contract: TarotContract | null }[]
  taker: Seat | null
  calledCard?: TarotCard
  partner?: Seat | null
  contract: TarotContract | null
  declarations: { seat: Seat; types: Declaration[]; shown: TarotCard[] }[]
  trick: TarotPlay[]
  tricks: CompletedTrick[]
  ready: Seat[]
  detail: { points: number; bouts: number; score: TarotDealDetail } | null
}

export interface TarotMatch {
  round: TarotRound
  totals: number[]
  completed: { dealer: Seat; taker: Seat | null; contract: TarotContract | null; detail: TarotRound['detail'] }[]
}

function reject(message: string): never {
  throw new RuleError('invalid', message)
}

function dealRound(
  completed: TarotMatch['completed'],
  dealer: Seat,
  randomInt: (n: number) => number,
  count: TarotPlayerCount,
): TarotRound {
  for (let i = 0; i < 100; i++) {
    const { hands, dog } = dealTarot(dealer, randomInt, count)
    if (
      hands.some((hand) => hand.includes('atout:1') && !hand.includes('excuse') && hand.filter(isTrump).length === 1)
    ) {
      completed.push({ dealer, taker: null, contract: null, detail: null })
      dealer = nextTarotSeat(dealer, count)
      continue
    }
    return {
      dealer,
      turn: nextTarotPlayer(dealer, count, dealer),
      phase: 'bidding',
      hands,
      dog,
      discard: [],
      bids: [],
      taker: null,
      contract: null,
      declarations: [],
      trick: [],
      tricks: [],
      ready: [],
      detail: null,
    }
  }
  return reject('Impossible de distribuer une donne valide.')
}

export function startTarot(dealer: Seat, randomInt: (n: number) => number, count: TarotPlayerCount = 4): TarotMatch {
  const completed: TarotMatch['completed'] = []
  return { totals: Array<number>(count).fill(0), completed, round: dealRound(completed, dealer, randomInt, count) }
}

export function tarotDeclarations(hand: TarotCard[], taker: boolean, playerCount: TarotPlayerCount): Declaration[] {
  const count = hand.filter((card) => isTrump(card) || card === 'excuse').length
  const result: Declaration[] = []
  const sizes = HANDFUL_SIZES[activeTarotCount(playerCount)]
  for (const type of ['poigneSimple', 'poigneDouble', 'poigneTriple'] as const)
    if (count >= sizes[type]) result.push(type)
  if (!hand.some((card) => /:[VCDR]$/.test(card))) result.push('blancTete')
  if (!hand.some(isTrump)) result.push('blancAtout')
  if (taker) result.push('petitChelem', 'grandChelem')
  return result
}

function resolveTarot(game: TarotMatch, ids: string[]): void {
  const r = game.round
  const taker = r.taker!
  const attack = (seat: Seat) => seat === taker || seat === r.partner
  const lastIndex = r.tricks.length - 1
  const pile = r.contract === 'gardeSans' ? r.dog : r.discard
  const taken = [...pile]
  let compensation = 0
  const bonuses: TarotBonusInput[] = []
  for (const [index, trick] of r.tricks.entries()) {
    for (const { card, seat } of trick.plays) {
      if (card === 'excuse' && index < lastIndex) {
        if (attack(seat)) taken.push(card)
        if (attack(seat) !== attack(trick.winner)) compensation += attack(seat) ? -1 : 1
      } else if (attack(trick.winner)) taken.push(card)
    }
  }
  const last = r.tricks[lastIndex]
  const excuseChelem =
    last.plays[0].card === 'excuse' &&
    last.winner === last.plays[0].seat &&
    r.tricks.every(({ winner }) => attack(winner) === attack(last.winner))
  const petitTrick = excuseChelem ? r.tricks[lastIndex - 1] : last
  if (petitTrick.plays.some(({ card }) => card === 'atout:1'))
    bonuses.push({ type: 'petitAuBout', playerId: ids[petitTrick.winner] })
  for (const { seat, types } of r.declarations) {
    for (const type of types)
      bonuses.push({
        type,
        playerId: ids[seat],
        ...(type.endsWith('Chelem')
          ? { tricksConceded: r.tricks.filter((trick) => attack(trick.winner) !== attack(seat)).length }
          : {}),
      })
  }
  const points = (taken.reduce((sum, card) => sum + halfPoints(card), 0) + compensation) / 2
  const bouts = taken.filter(isBout).length as 0 | 1 | 2 | 3
  const score = scoreTarot(
    {
      takerId: ids[taker],
      contract: r.contract!,
      ...gapFromPoints(points, bouts),
      calledId: r.partner == null ? null : ids[r.partner],
      aloneReason:
        r.partner == null && r.calledCard ? (r.dog.includes(r.calledCard) ? 'king_in_dog' : 'self_call') : null,
      bonuses,
    },
    { playerIds: ids, dealerId: ids[r.dealer] },
    defaultRules('tarot') as TarotRules,
  )
  r.detail = { points, bouts, score }
  game.totals = game.totals.map((total, index) => total + score.delta[index])
  game.completed.push({ dealer: r.dealer, taker, contract: r.contract, detail: r.detail })
  r.phase = 'summary'
}

export function tarotCalls(hand: readonly TarotCard[]): TarotCard[] {
  for (const rank of SUIT_CALL_RANKS) {
    const candidates = tarotCallCards(rank)
    if (candidates.some((card) => !hand.includes(card))) return candidates
  }
  return tarotCallCards('V')
}

function afterTarotCall(round: TarotRound, count: TarotPlayerCount): void {
  if (round.contract === 'pousse' || round.contract === 'garde') {
    round.hands[round.taker!].push(...round.dog)
    round.turn = round.taker!
    round.phase = 'discard'
  } else {
    round.turn = nextTarotPlayer(round.dealer, count, round.dealer)
    round.phase = 'declare'
  }
}

export function playableTarotCards(round: TarotRound, seat: Seat): TarotCard[] {
  const legal = legalTarotCards(round.hands[seat], round.trick)
  if (!round.calledCard || round.tricks.length || round.trick.some(({ card }) => card !== 'excuse')) return legal
  const suit = round.calledCard.split(':')[0]
  const opening = legal.filter((card) => card === round.calledCard || !card.startsWith(suit + ':'))
  return opening.length ? opening : legal
}

export function playTarot(
  game: TarotMatch,
  seat: Seat,
  cmd: Command,
  ids: string[],
  randomInt: (n: number) => number,
): void {
  const r = game.round
  const count = game.totals.length as TarotPlayerCount
  const active = activeTarotCount(count)
  const trickLimit = tarotHandSize(count)
  if (cmd.type === 'nextRound' && r.phase === 'summary') {
    if (!r.ready.includes(seat)) r.ready.push(seat)
    if (r.ready.length === count)
      game.round = dealRound(game.completed, nextTarotSeat(r.dealer, count), randomInt, count)
    return
  }
  if (count === 6 && seat === r.dealer) reject('Le donneur ne joue pas cette donne.')
  if (seat !== r.turn) throw new RuleError('not_your_turn', 'Ce n’est pas votre tour.')
  if (r.phase === 'bidding' && (cmd.type === 'pass' || cmd.type === 'tarotBid')) {
    if (cmd.type === 'tarotBid') {
      if (r.contract && CONTRACTS.indexOf(cmd.contract) <= CONTRACTS.indexOf(r.contract))
        reject('Le contrat doit être supérieur à l’enchère précédente.')
      r.taker = seat
      r.contract = cmd.contract
    }
    r.bids.push({ seat, contract: cmd.type === 'tarotBid' ? cmd.contract : null })
    r.turn = nextTarotPlayer(seat, count, r.dealer)
    if (r.bids.length < active) return
    if (r.taker == null) {
      game.completed.push({ dealer: r.dealer, taker: null, contract: null, detail: null })
      game.round = dealRound(game.completed, nextTarotSeat(r.dealer, count), randomInt, count)
    } else if (active === 5) {
      r.turn = r.taker
      r.phase = 'call'
    } else afterTarotCall(r, count)
    return
  }
  if (r.phase === 'call' && cmd.type === 'tarotCall') {
    if (!tarotCalls(r.hands[seat]).includes(cmd.card)) reject('Cette carte ne peut pas être appelée.')
    r.calledCard = cmd.card
    const partner = r.hands.findIndex((hand, index) => index !== seat && hand.includes(cmd.card))
    r.partner = partner < 0 ? null : (partner as Seat)
    afterTarotCall(r, count)
    return
  }
  if (r.phase === 'discard' && cmd.type === 'tarotDiscard') {
    const chosen = new Set(cmd.cards)
    const dogSize = r.dog.length
    const allowed = discardableTarotCards(r.hands[seat], dogSize)
    const ordinary = allowed.filter((card) => !isTrump(card)).length
    if (chosen.size !== dogSize || cmd.cards.length !== dogSize || cmd.cards.some((card) => !allowed.includes(card)))
      reject('Choisissez le nombre de cartes autorisées pour l’écart.')
    if (cmd.cards.filter(isTrump).length !== Math.max(0, dogSize - ordinary))
      reject('On écarte des atouts uniquement si les autres cartes ne suffisent pas.')
    r.discard = cmd.cards
    r.hands[seat] = r.hands[seat].filter((card) => !chosen.has(card))
    r.turn = nextTarotPlayer(r.dealer, count, r.dealer)
    r.phase = 'declare'
    return
  }
  if (r.phase === 'declare' && cmd.type === 'tarotDeclare') {
    const eligible = tarotDeclarations(r.hands[seat], seat === r.taker, count)
    const types = [...new Set(cmd.types)]
    const handfuls = types.filter(
      (type) => type === 'poigneSimple' || type === 'poigneDouble' || type === 'poigneTriple',
    )
    const chelems = types.filter((type) => type.endsWith('Chelem'))
    if (types.some((type) => !eligible.includes(type)) || handfuls.length > 1 || chelems.length > 1)
      reject('Cette combinaison d’annonces n’est pas autorisée.')
    const shown = cmd.shown
    const size = handfuls[0] ? HANDFUL_SIZES[active][handfuls[0]] : 0
    if (
      new Set(shown).size !== size ||
      shown.length !== size ||
      shown.some((card) => !r.hands[seat].includes(card) || (!isTrump(card) && card !== 'excuse')) ||
      (shown.includes('excuse') && r.hands[seat].filter(isTrump).length !== size - 1)
    )
      reject('Montrez les atouts de la poignée. L’Excuse ne complète qu’une poignée exacte.')
    r.declarations.push({ seat, types, shown })
    r.turn = nextTarotPlayer(seat, count, r.dealer)
    if (r.declarations.length === active) {
      r.phase = 'playing'
      if (r.declarations.some((declaration) => declaration.types.includes('grandChelem'))) r.turn = r.taker!
    }
    return
  }
  if (r.phase === 'playing' && cmd.type === 'tarotPlay') {
    if (!playableTarotCards(r, seat).includes(cmd.card)) reject('Cette carte ne peut pas être jouée.')
    r.hands[seat] = r.hands[seat].filter((card) => card !== cmd.card)
    r.trick.push({ seat, card: cmd.card })
    r.turn = nextTarotPlayer(seat, count, r.dealer)
    if (r.trick.length !== active) return
    const opening = r.trick[0]
    const excuseChelem =
      r.tricks.length === trickLimit - 1 &&
      opening.card === 'excuse' &&
      r.tricks.every(
        ({ winner }) =>
          (winner === r.taker || winner === r.partner) === (opening.seat === r.taker || opening.seat === r.partner),
      )
    const winner = excuseChelem ? opening.seat : tarotTrickWinner(r.trick)
    r.tricks.push({ plays: r.trick, winner })
    r.trick = []
    r.turn = winner
    if (r.tricks.length === trickLimit) resolveTarot(game, ids)
    return
  }
  throw new RuleError('wrong_phase', 'Cette action n’est pas disponible à cette étape.')
}
