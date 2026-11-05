import { describe, expect, it } from 'vitest'
import { cardKey, cardPoints, dealHands, fullDeck, shuffleDeck, sortHand, trickPoints, trickWinner } from './cards'
import type { Card, Suit, TrickCard } from './cards'
import { seededRandomInt } from './testkit'

const t = (seat: 0 | 1 | 2 | 3, rank: Card['rank'], suit: Suit): TrickCard => ({ seat, card: { rank, suit } })

describe('paquet', () => {
  it('32 cartes uniques, 8 par joueur, aucune perte ni doublon après mélange et distribution', () => {
    expect(new Set(fullDeck().map(cardKey)).size).toBe(32)
    const hands = dealHands(shuffleDeck(seededRandomInt(42)))
    expect(hands.every((h) => h.length === 8)).toBe(true)
    expect(new Set(hands.flat().map(cardKey))).toEqual(new Set(fullDeck().map(cardKey)))
  })
  it('refuse une source aléatoire invalide', () => {
    expect(() => shuffleDeck(() => 99)).toThrow()
  })
  it('mélange non biaisé : chaque position est à peu près uniforme (Fisher-Yates)', () => {
    const rnd = seededRandomInt(7)
    const counts = new Array(32).fill(0)
    const N = 6400
    for (let i = 0; i < N; i++) counts[shuffleDeck(rnd).findIndex((c) => cardKey(c) === 'pique:A')]++
    for (const c of counts) expect(Math.abs(c - N / 32)).toBeLessThan(80)
  })
  it('total de 152 points de cartes pour chaque atout (162 avec le dernier pli)', () => {
    for (const trump of ['coeur', 'pique', 'trefle', 'carreau'] as Suit[])
      expect(fullDeck().reduce((s, c) => s + cardPoints(c, trump), 0)).toBe(152)
  })
})

describe('valeurs', () => {
  it("points à l'atout et hors atout", () => {
    const p = (rank: Card['rank'], suit: Suit) => cardPoints({ rank, suit }, 'coeur')
    expect([p('V', 'coeur'), p('9', 'coeur'), p('A', 'coeur'), p('10', 'coeur'), p('R', 'coeur'), p('D', 'coeur'), p('8', 'coeur'), p('7', 'coeur')]).toEqual([20, 14, 11, 10, 4, 3, 0, 0])
    expect([p('V', 'pique'), p('9', 'pique'), p('A', 'pique'), p('10', 'pique'), p('R', 'pique'), p('D', 'pique'), p('8', 'pique'), p('7', 'pique')]).toEqual([2, 0, 11, 10, 4, 3, 0, 0])
  })
  it("ordre à l'atout : V > 9 > A > 10 > R > D > 8 > 7", () => {
    const order = ['V', '9', 'A', '10', 'R', 'D', '8', '7'] as const
    for (let i = 0; i < order.length - 1; i++)
      expect(trickWinner([t(0, order[i + 1], 'coeur'), t(1, order[i], 'coeur')], 'coeur')).toBe(1)
  })
  it('ordre hors atout : A > 10 > R > D > V > 9 > 8 > 7', () => {
    const order = ['A', '10', 'R', 'D', 'V', '9', '8', '7'] as const
    for (let i = 0; i < order.length - 1; i++)
      expect(trickWinner([t(0, order[i + 1], 'pique'), t(1, order[i], 'pique')], 'coeur')).toBe(1)
  })
  it("l'atout coupe ; une défausse ne gagne jamais ; le plus fort atout l'emporte", () => {
    expect(trickWinner([t(0, 'A', 'pique'), t(1, '7', 'coeur'), t(2, 'A', 'carreau'), t(3, '8', 'coeur')], 'coeur')).toBe(3)
    expect(trickWinner([t(0, '7', 'pique'), t(1, 'A', 'carreau'), t(2, '8', 'pique'), t(3, 'A', 'trefle')], 'coeur')).toBe(2)
  })
  it('points d’un pli', () => {
    expect(trickPoints([t(0, 'V', 'coeur'), t(1, 'A', 'pique'), t(2, '10', 'pique'), t(3, 'D', 'trefle')], 'coeur')).toBe(20 + 11 + 10 + 3)
  })
  it("tri d'affichage : atout d'abord, plus fort à gauche", () => {
    const hand = sortHand([t(0, '7', 'pique').card, t(0, 'V', 'coeur').card, t(0, '9', 'coeur').card, t(0, 'A', 'pique').card], 'coeur')
    expect(hand.map(cardKey)).toEqual(['coeur:V', 'coeur:9', 'pique:A', 'pique:7'])
  })
})
