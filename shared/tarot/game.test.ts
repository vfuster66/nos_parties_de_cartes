import { describe, expect, it } from 'vitest'
import type { Seat } from '../coinche/cards'
import { act, lobby, PIDS, seededRandomInt } from '../coinche/testkit'
import { buildView } from '../coinche/views'
import { dealTarot, halfPoints, legalTarotCards, tarotTrickWinner } from './cards'
import type { TarotCard } from './cards'

function start() {
  const state = lobby()
  state.config.game = 'tarot'
  state.config.target = 1000
  state.config.firstDealer = 3
  return act(
    state,
    'p0',
    { type: 'start' },
    {
      now: 1,
      paused: false,
      randomInt: seededRandomInt(59),
    },
  )
}

describe('tarot en ligne à quatre', () => {
  it('distribue les 78 cartes pour un total de 91 points', () => {
    const { hands, dog } = dealTarot(3, seededRandomInt(12))
    const cards = [...hands.flat(), ...dog]
    expect(hands.map((hand) => hand.length)).toEqual([18, 18, 18, 18])
    expect(dog).toHaveLength(6)
    expect(new Set(cards).size).toBe(78)
    expect(cards.reduce((points, card) => points + halfPoints(card), 0)).toBe(182)
  })

  it('impose la surcoupe, puis la sous-coupe si aucun atout supérieur ne reste', () => {
    const trick = [
      { seat: 0 as const, card: 'coeur:3' as const },
      { seat: 1 as const, card: 'atout:12' as const },
    ]
    expect(legalTarotCards(['atout:13', 'atout:11', 'pique:3', 'excuse'], trick)).toEqual(['atout:13', 'excuse'])
    expect(legalTarotCards(['atout:11', 'pique:3'], trick)).toEqual(['atout:11'])
    expect(legalTarotCards(['coeur:2', 'atout:11'], trick)).toEqual(['coeur:2'])
  })

  it('détermine la couleur à fournir après une entame à l’Excuse', () => {
    const trick = [
      { seat: 0 as const, card: 'excuse' as const },
      { seat: 1 as const, card: 'coeur:3' as const },
    ]
    expect(legalTarotCards(['coeur:2', 'atout:11'], trick)).toEqual(['coeur:2'])
    expect(tarotTrickWinner(trick)).toBe(1)
  })

  it.each(['garde', 'gardeSans', 'gardeContre'] as const)(
    'joue 18 plis en %s et calcule un score à somme nulle',
    (contract) => {
      let s = start()
      const connected = new Set(PIDS)
      const view = (seat: Seat) => buildView(s, PIDS[seat], connected, 0).tarot!
      const taker = s.tarot!.round.turn
      expect(view(taker).hand).toHaveLength(18)
      expect(view(taker).dog).toEqual([])
      expect(view(taker)).not.toHaveProperty('hands')
      s = act(s, PIDS[taker], { type: 'tarotBid', contract })
      for (let i = 0; i < 3; i++) s = act(s, PIDS[s.tarot!.round.turn], { type: 'pass' })
      if (contract === 'garde') {
        expect(view(taker).dog).toHaveLength(6)
        expect(view(taker).hand).toHaveLength(24)
        const forbidden: TarotCard[] = ['atout:1', 'atout:21', 'excuse', 'coeur:R', 'pique:R', 'trefle:R']
        expect(() => act(s, PIDS[taker], { type: 'tarotDiscard', cards: forbidden })).toThrow()
        s = act(s, PIDS[taker], { type: 'tarotDiscard', cards: view(taker).actions.discard.slice(0, 6) })
      } else {
        expect(view(taker).dog).toEqual([])
      }
      for (let i = 0; i < 4; i++) s = act(s, PIDS[s.tarot!.round.turn], { type: 'tarotDeclare', types: [], shown: [] })
      for (let i = 0; i < 72; i++) {
        const seat = s.tarot!.round.turn
        s = act(s, PIDS[seat], { type: 'tarotPlay', card: view(seat).actions.playable[0] })
      }
      expect(s.tarot!.round.phase).toBe('summary')
      expect(view(taker).trickCount).toBe(18)
      const result = view(taker).detail!
      expect(result.bouts).toBeLessThanOrEqual(3)
      expect(result.points).toBeGreaterThanOrEqual(0)
      expect(result.points).toBeLessThanOrEqual(91)
      expect(result.score.base).toBe({ garde: 80, gardeSans: 160, gardeContre: 320 }[contract])
      expect(result.score.delta.reduce((a, b) => a + b, 0)).toBe(0)
      expect(s.tarot!.totals).toEqual(result.score.delta)
      expect(act(s, 'p0', { type: 'tarotFinish' }).status).toBe('finished')
    },
  )
})
