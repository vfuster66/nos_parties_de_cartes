import { describe, expect, it } from 'vitest'
import { cardKey } from './cards'
import type { Card, Seat, Suit, TrickCard } from './cards'
import { legalCards } from './rules'

const k = (rank: Card['rank'], suit: Suit): Card => ({ rank, suit })
const tc = (seat: Seat, rank: Card['rank'], suit: Suit): TrickCard => ({ seat, card: k(rank, suit) })
const keys = (cs: Card[]) => cs.map(cardKey).sort()
const legal = (hand: Card[], trick: TrickCard[], seat: Seat) => keys(legalCards(hand, trick, 'coeur', seat))

describe('cartes autorisées (règles personnalisées)', () => {
  it('on peut entamer n’importe quelle carte', () => {
    const hand = [k('7', 'pique'), k('A', 'coeur')]
    expect(legal(hand, [], 0)).toEqual(keys(hand))
  })
  it('obligation de fournir hors atout, sans obligation de monter', () => {
    const hand = [k('7', 'pique'), k('A', 'pique'), k('A', 'carreau')]
    expect(legal(hand, [tc(0, 'R', 'pique')], 1)).toEqual(keys([k('7', 'pique'), k('A', 'pique')]))
  })
  it('fournir à la couleur demandée même si le pli est déjà coupé', () => {
    const hand = [k('7', 'pique'), k('A', 'coeur')]
    expect(legal(hand, [tc(0, 'R', 'pique'), tc(1, '7', 'coeur')], 2)).toEqual(keys([k('7', 'pique')]))
  })
  it('partenaire maître et couleur absente : défausse libre, sans obligation de couper', () => {
    const hand = [k('7', 'carreau'), k('8', 'coeur')]
    // seat 0 (A de pique) est le partenaire de seat 2 et est maître
    expect(legal(hand, [tc(0, 'A', 'pique'), tc(1, 'R', 'pique')], 2)).toEqual(keys(hand))
  })
  it('adversaire maître, aucun atout joué : obligation de couper', () => {
    const hand = [k('7', 'carreau'), k('8', 'coeur'), k('D', 'coeur')]
    expect(legal(hand, [tc(0, 'R', 'pique')], 1)).toEqual(keys([k('8', 'coeur'), k('D', 'coeur')]))
  })
  it('adversaire maître sans atout en main : défausse libre', () => {
    const hand = [k('7', 'carreau'), k('8', 'trefle')]
    expect(legal(hand, [tc(0, 'R', 'pique')], 1)).toEqual(keys(hand))
  })
  it('pli déjà coupé par un adversaire : obligation de surcouper si possible', () => {
    const hand = [k('7', 'coeur'), k('V', 'coeur'), k('A', 'carreau')]
    const trick = [tc(0, 'R', 'pique'), tc(1, '10', 'coeur')]
    // seat 2 est partenaire de seat 0 (maître ? non : seat 1 a coupé, donc seat 1 est maître)
    expect(legal(hand, trick, 2)).toEqual(keys([k('V', 'coeur')]))
  })
  it('surcoupe impossible : on peut jouer n’importe quelle carte, même un atout inférieur (pas de sous-coupe forcée)', () => {
    const hand = [k('7', 'coeur'), k('8', 'coeur'), k('A', 'carreau')]
    const trick = [tc(0, 'R', 'pique'), tc(1, 'V', 'coeur')]
    expect(legal(hand, trick, 2)).toEqual(keys(hand))
  })
  it('partenaire a coupé et est maître : défausse libre', () => {
    const hand = [k('7', 'coeur'), k('A', 'carreau')]
    const trick = [tc(0, 'R', 'pique'), tc(1, '8', 'pique'), tc(2, 'A', 'pique')]
    // seat 3 : seat 2 est son opposé... seat 3 a pour partenaire seat 1. Seat 1 (8 pique) n'est pas maître
    expect(legal(hand, trick, 3)).toEqual(keys([k('7', 'coeur')]))
    const t2 = [tc(0, 'R', 'pique'), tc(1, '8', 'coeur'), tc(2, 'A', 'pique')]
    expect(legal(hand, t2, 3)).toEqual(keys(hand)) // partenaire (seat 1) maître grâce à l'atout
  })
  it("atout demandé : fournir, et monter même si le partenaire est maître", () => {
    const hand = [k('7', 'coeur'), k('V', 'coeur'), k('A', 'pique')]
    const trick = [tc(0, 'A', 'coeur'), tc(1, '8', 'coeur')] // seat 2 : partenaire (seat 0) maître avec l'as
    expect(legal(hand, trick, 2)).toEqual(keys([k('V', 'coeur')]))
  })
  it("atout demandé, montée impossible : fournir un atout inférieur", () => {
    const hand = [k('7', 'coeur'), k('8', 'coeur'), k('A', 'pique')]
    expect(legal(hand, [tc(0, 'V', 'coeur')], 1)).toEqual(keys([k('7', 'coeur'), k('8', 'coeur')]))
  })
  it("atout demandé sans atout : défausse libre", () => {
    const hand = [k('A', 'pique'), k('7', 'carreau')]
    expect(legal(hand, [tc(0, 'V', 'coeur')], 1)).toEqual(keys(hand))
  })
})
