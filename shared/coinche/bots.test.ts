import { describe, expect, it } from 'vitest'
import { nextBotIntent } from './bots'
import type { Card, Seat } from './cards'
import type { MatchState } from './types'
import { act, c, PIDS, started, suitedHands, withHands } from './testkit'
import { buildView } from './views'

const bid = (s: MatchState, seat: Seat, value: number, suit = 'coeur') =>
  act(s, PIDS[seat], { type: 'bid', value, suit })
const pass = (s: MatchState, seat: Seat) => act(s, PIDS[seat], { type: 'pass' })
const alwaysLow = () => 0

function move(hands: Card[][], from: number, to: number, card: Card): void {
  const index = hands[from].findIndex((held) => held.suit === card.suit && held.rank === card.rank)
  hands[to].push(hands[from].splice(index, 1)[0])
}

describe('joueur automatique', () => {
  it('le preneur qui a le valet et le 9 d’atout les joue pour faire tomber les atouts', () => {
    const hands = suitedHands(['pique', 'coeur', 'carreau', 'trefle'])
    move(hands, 1, 0, c('V', 'coeur'))
    move(hands, 0, 1, c('7', 'pique'))
    move(hands, 1, 0, c('9', 'coeur'))
    move(hands, 0, 1, c('8', 'pique'))
    let state = withHands(started({ botDifficulty: 1 }), hands)
    state = pass(pass(pass(bid(state, 0, 80, 'coeur'), 1), 2), 3)

    const lead = nextBotIntent(buildView(state, 'p0', new Set(PIDS), 0), alwaysLow)
    expect(lead).toMatchObject({ type: 'playCard', card: { suit: 'coeur', rank: 'V' } })

    state = act(state, 'p0', { type: 'playCard', card: c('V', 'coeur') })
    state = act(state, 'p1', { type: 'playCard', card: c('7', 'coeur') })
    state = act(state, 'p2', { type: 'playCard', card: c('7', 'carreau') })
    state = act(state, 'p3', { type: 'playCard', card: c('7', 'trefle') })

    const second = nextBotIntent(buildView(state, 'p0', new Set(PIDS), 0), alwaysLow)
    expect(second).toMatchObject({ type: 'playCard', card: { suit: 'coeur', rank: '9' } })
  })

  it('sans le valet, le preneur ne sort pas le 9 avant son as', () => {
    const hands = suitedHands(['pique', 'coeur', 'carreau', 'trefle'])
    move(hands, 1, 0, c('9', 'coeur'))
    move(hands, 0, 1, c('7', 'pique'))
    let state = withHands(started({ botDifficulty: 5 }), hands)
    state = pass(pass(pass(bid(state, 0, 80, 'coeur'), 1), 2), 3)

    const lead = nextBotIntent(buildView(state, 'p0', new Set(PIDS), 0), alwaysLow)
    expect(lead).toMatchObject({ type: 'playCard', card: { suit: 'pique', rank: 'A' } })
  })

  it('le partenaire qui a seulement le 9 et un as monte de 10, pas de 20', () => {
    const hands = suitedHands(['pique', 'coeur', 'carreau', 'trefle'])
    move(hands, 1, 2, c('9', 'coeur'))
    move(hands, 2, 1, c('7', 'carreau'))
    move(hands, 1, 2, c('8', 'coeur'))
    move(hands, 2, 1, c('A', 'carreau'))
    move(hands, 0, 2, c('A', 'pique'))
    move(hands, 2, 0, c('8', 'carreau'))
    let state = withHands(started({ botDifficulty: 2 }), hands)
    state = pass(bid(state, 0, 80, 'coeur'), 1)

    const speak = nextBotIntent(buildView(state, 'p2', new Set(PIDS), 0), alwaysLow)
    expect(speak).toMatchObject({ type: 'bid', value: 90, suit: 'coeur' })
  })

  it('le partenaire qui a le valet et le 9 monte de 20', () => {
    const hands = suitedHands(['pique', 'coeur', 'carreau', 'trefle'])
    move(hands, 1, 2, c('V', 'coeur'))
    move(hands, 2, 1, c('7', 'carreau'))
    move(hands, 1, 2, c('9', 'coeur'))
    move(hands, 2, 1, c('8', 'carreau'))
    let state = withHands(started({ botDifficulty: 2 }), hands)
    state = pass(bid(state, 0, 80, 'coeur'), 1)

    const speak = nextBotIntent(buildView(state, 'p2', new Set(PIDS), 0), alwaysLow)
    expect(speak).toMatchObject({ type: 'bid', value: 100, suit: 'coeur' })
  })

  it('une main d’ouverture ne poursuit pas un contrat déjà haut', () => {
    const hands = suitedHands(['pique', 'coeur', 'carreau', 'trefle'])
    move(hands, 1, 0, c('V', 'coeur'))
    move(hands, 1, 0, c('10', 'coeur'))
    move(hands, 1, 0, c('D', 'coeur'))
    move(hands, 1, 0, c('7', 'coeur'))
    move(hands, 3, 0, c('8', 'trefle'))
    move(hands, 2, 0, c('7', 'carreau'))
    move(hands, 0, 1, c('7', 'pique'))
    move(hands, 0, 1, c('8', 'pique'))
    move(hands, 0, 1, c('9', 'pique'))
    move(hands, 0, 1, c('V', 'pique'))
    move(hands, 0, 3, c('D', 'pique'))
    move(hands, 0, 2, c('R', 'pique'))
    let state = withHands(started({ botDifficulty: 2 }), hands)
    state = bid(state, 0, 80, 'coeur')
    state = bid(state, 1, 100, 'pique')
    state = pass(state, 2)
    state = pass(state, 3)

    const again = nextBotIntent(buildView(state, 'p0', new Set(PIDS), 0), alwaysLow)
    expect(again).toMatchObject({ type: 'pass' })
  })

  it('ne change pas la couleur du partenaire sans un jeu clairement meilleur', () => {
    const hands = suitedHands(['pique', 'coeur', 'carreau', 'trefle'])
    move(hands, 2, 3, c('9', 'carreau'))
    move(hands, 2, 3, c('A', 'carreau'))
    move(hands, 2, 3, c('D', 'carreau'))
    move(hands, 3, 2, c('7', 'trefle'))
    move(hands, 3, 2, c('8', 'trefle'))
    move(hands, 3, 2, c('9', 'trefle'))
    let state = withHands(started({ botDifficulty: 2 }), hands)
    state = pass(bid(state, 0, 80, 'coeur'), 1)

    const speak = nextBotIntent(buildView(state, 'p2', new Set(PIDS), 0), alwaysLow)
    expect(speak).toMatchObject({ type: 'pass' })
  })

  it('change de couleur seulement quand son jeu est clairement meilleur', () => {
    const hands = suitedHands(['pique', 'coeur', 'carreau', 'trefle'])
    let state = withHands(started({ botDifficulty: 2 }), hands)
    state = pass(bid(state, 0, 80, 'coeur'), 1)

    const speak = nextBotIntent(buildView(state, 'p2', new Set(PIDS), 0), alwaysLow)
    expect(speak).toMatchObject({ type: 'bid', value: 90, suit: 'carreau' })
  })

  it('en défense, n’entame pas atout et ne rend pas de points', () => {
    const hands = suitedHands(['pique', 'coeur', 'carreau', 'trefle'])
    move(hands, 1, 0, c('7', 'coeur'))
    move(hands, 0, 1, c('7', 'pique'))
    let state = withHands(started({ botDifficulty: 1 }), hands)
    state = pass(state, 0)
    state = pass(pass(bid(state, 1, 80, 'coeur'), 2), 3)
    state = pass(state, 0)

    const lead = nextBotIntent(buildView(state, 'p0', new Set(PIDS), 0), alwaysLow)
    expect(lead).toMatchObject({ type: 'playCard', card: { suit: 'pique', rank: 'A' } })

    let feeding = withHands(started({ botDifficulty: 1 }), suitedHands(['pique', 'coeur', 'carreau', 'trefle']))
    feeding = pass(pass(pass(bid(feeding, 0, 80, 'pique'), 1), 2), 3)
    feeding = act(feeding, 'p0', { type: 'playCard', card: c('8', 'pique') })
    const discard = nextBotIntent(buildView(feeding, 'p1', new Set(PIDS), 0), alwaysLow)
    expect(discard).toMatchObject({ type: 'playCard', card: { suit: 'coeur', rank: '7' } })
  })
})
