// Cartes autorisées : règles personnalisées de l'application (pas les règles officielles).
import { cardPower, partnerOf, trickWinner } from './cards'
import type { Card, Seat, Suit, TrickCard } from './cards'

/** Cartes que `seat` peut jouer. Le serveur s'en sert pour valider ; le client pour l'affichage seulement. */
export function legalCards(hand: readonly Card[], trick: readonly TrickCard[], trump: Suit, seat: Seat): Card[] {
  if (!trick.length) return [...hand]
  const led = trick[0].card.suit
  const ofLed = hand.filter((c) => c.suit === led)
  const trumps = hand.filter((c) => c.suit === trump)
  const best = (): number => Math.max(...trick.map((t) => cardPower(t.card, trump, led)))

  if (led === trump) {
    if (!ofLed.length) return [...hand] // sans atout : défausse libre
    const higher = ofLed.filter((c) => cardPower(c, trump, led) > best()) // monter, même sur le partenaire
    return higher.length ? higher : ofLed // sinon fournir un atout inférieur
  }

  if (ofLed.length) return ofLed // fournir, sans obligation de monter
  if (trickWinner(trick, trump) === partnerOf(seat)) return [...hand] // partenaire maître : libre
  if (!trumps.length) return [...hand]
  const alreadyCut = trick.some((t) => t.card.suit === trump)
  if (!alreadyCut) return trumps // couper
  const over = trumps.filter((c) => cardPower(c, trump, led) > best())
  return over.length ? over : [...hand] // surcouper si possible, sinon libre (pas de sous-coupe forcée)
}
