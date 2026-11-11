import { describe, expect, it } from 'vitest'
import { beloteAnnouncements, evaluateBeloteAnnouncements } from './belote'
import { SUITS } from './cards'
import type { Card, Seat } from './cards'
import { act, c, lobby, PIDS, suitedHands } from './testkit'
import { buildView } from './views'

function begin(game: 'belote' | 'belote-annonces' = 'belote') {
  const s = lobby()
  s.config.game = game
  s.config.firstDealer = 3
  s.config.target = 1000
  return act(s, 'p0', { type: 'start' })
}

describe('belote en ligne', () => {
  it('garde les cartes du talon privées et distribue la retournée au preneur', () => {
    let s = begin()
    const turned = s.round!.beloteDeal!.turned
    const view = buildView(s, 'p0', new Set(PIDS), 0)
    expect(view.hand).toHaveLength(5)
    expect(view.round?.beloteDeal).toEqual({ turned, pass: 1 })
    expect(view.actions.takeSuits).toEqual([turned.suit])
    expect(() => act(s, 'p0', { type: 'take', suit: SUITS.find((suit) => suit !== turned.suit) })).toThrow()
    s = act(s, 'p0', { type: 'take', suit: turned.suit })
    expect(s.round!.hands.map((hand) => hand.length)).toEqual([8, 8, 8, 8])
    expect(s.round!.hands[0]).toContainEqual(turned)
    expect(new Set(s.round!.hands.flat().map((card) => card.suit + card.rank)).size).toBe(32)
  })

  it('exclut la couleur retournée au second tour et change de donneur après huit passes', () => {
    let s = begin()
    const turned = s.round!.beloteDeal!.turned
    for (const pid of PIDS) s = act(s, pid, { type: 'pass' })
    expect(buildView(s, 'p0', new Set(PIDS), 0).actions.takeSuits).not.toContain(turned.suit)
    expect(() => act(s, 'p0', { type: 'take', suit: turned.suit })).toThrow()
    for (const pid of PIDS) s = act(s, pid, { type: 'pass' })
    expect(s.rounds[0].passed).toBe(true)
    expect(s.round?.dealer).toBe(0)
    expect(s.totals).toEqual([0, 0])
  })

  it.each(['belote', 'belote-annonces'] as const)('joue une donne complète en mode %s', (game) => {
    let s = begin(game)
    for (const pid of PIDS) s = act(s, pid, { type: 'pass' })
    const suit = SUITS.find((candidate) => candidate !== s.round!.beloteDeal!.turned.suit)!
    s = act(s, 'p0', { type: 'take', suit })
    for (let i = 0; i < 32; i++) {
      const pid = PIDS[s.round!.turn!]
      const { actions } = buildView(s, pid, new Set(PIDS), 0)
      s = act(s, pid, { type: 'playCard', card: actions.playable[0] })
    }
    expect(s.round?.phase).toBe('summary')
    const record = s.rounds[0]
    expect(record.trickPoints[0] + record.trickPoints[1]).toBe(162)
    expect(record.detail?.multiplier).toBe(1)
    expect(record.tricks).toHaveLength(8)
    expect(s.totals).toEqual(record.delta)
  })

  it('compte une suite une seule fois et départage les suites de même hauteur à l’atout', () => {
    const cards = (seat: Seat, hand: Card[]) => hand.map((card) => ({ seat, card }))
    const tricks = [
      {
        winner: 0 as const,
        cards: [
          ...cards(0, [c('7', 'coeur'), c('8', 'coeur'), c('9', 'coeur'), c('10', 'coeur')]),
          ...cards(1, [c('7', 'pique'), c('8', 'pique'), c('9', 'pique'), c('10', 'pique')]),
        ],
      },
    ]
    expect(beloteAnnouncements(tricks, 'coeur')).toEqual({
      announcements: [{ cinquante: 1 }, { cinquante: 1 }],
      strongest: 0,
    })
    expect(beloteAnnouncements(tricks, 'carreau').strongest).toBe('tie')
  })
})

it('annonce avant le jeu et montre seulement les cartes retenues au deuxième pli', () => {
  let state = begin('belote-annonces')
  const round = state.round!
  round.hands = suitedHands(['coeur', 'pique', 'carreau', 'trefle'])
  round.contract = { seat: 0, suit: 'coeur', value: 'prise', bidIndex: 0 }
  round.phase = 'playing'
  round.announcements = evaluateBeloteAnnouncements(round.hands, 'coeur')
  const connected = new Set(PIDS)
  const view = (id: string) => buildView(state, id, connected, 0)
  const first = view('p0').round!.announcements!
  expect(first.declared).toHaveLength(4)
  expect(first.declared.every((entry) => !('cards' in entry))).toBe(true)
  expect(first.revealed).toEqual([])
  expect(first.strongest).toBeNull()
  for (let i = 0; i < 4; i++) {
    const id = PIDS[state.round!.turn!]
    state = act(state, id, { type: 'playCard', card: view(id).actions.playable[0] })
    if (i < 3) expect(view('p0').round!.announcements!.revealed).toEqual([])
  }
  for (const id of PIDS) {
    const shown = view(id).round!.announcements!
    expect(shown.strongest).toBe(0)
    expect(shown.revealed.map(({ seat, cards }) => [seat, cards.length])).toEqual([
      [0, 8],
      [2, 8],
    ])
  }
})
