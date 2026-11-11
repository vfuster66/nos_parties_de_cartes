import { ANNOUNCE_POINTS } from '../../src/engine/belote'
import type { AnnounceCounts, AnnounceType } from '../../src/engine/belote'
import { SUITS, teamOf } from './cards'
import type { Rank, Suit, TeamIdx } from './cards'
import type { PlayedTrick, RoundState } from './types'

export function takeSuits(round: RoundState): Suit[] {
  const deal = round.beloteDeal
  if (!deal) return []
  return deal.pass === 1 ? [deal.turned.suit] : SUITS.filter((suit) => suit !== deal.turned.suit)
}

const sequenceOrder: Rank[] = ['7', '8', '9', '10', 'V', 'D', 'R', 'A']
const squareOrder: Rank[] = ['D', 'R', '10', 'A', '9', 'V']
interface Announcement {
  kind: AnnounceType
  rank: number
  length: number
  trump: boolean
  square: boolean
}

function compare(a: Announcement, b: Announcement): number {
  return (
    ANNOUNCE_POINTS[a.kind] - ANNOUNCE_POINTS[b.kind] ||
    Number(a.square) - Number(b.square) ||
    a.length - b.length ||
    a.rank - b.rank ||
    Number(a.trump) - Number(b.trump)
  )
}

/** Décompte après le dernier pli, quand toutes les cartes des quatre mains sont publiques. */
export function beloteAnnouncements(tricks: PlayedTrick[], trump: Suit) {
  const played = tricks.flatMap((trick) => trick.cards)
  const announcements: [AnnounceCounts, AnnounceCounts] = [{}, {}]
  const strongestByTeam: [Announcement | undefined, Announcement | undefined] = [undefined, undefined]
  for (const seat of [0, 1, 2, 3] as const) {
    const team = teamOf(seat)
    const hand = played.filter((entry) => entry.seat === seat).map((entry) => entry.card)
    const add = (candidate: Announcement) => {
      const counts = announcements[team]
      counts[candidate.kind] = (counts[candidate.kind] ?? 0) + 1
      const current = strongestByTeam[team]
      if (!current || compare(candidate, current) > 0) strongestByTeam[team] = candidate
    }

    for (const [rank, name] of squareOrder.entries()) {
      if (hand.filter((card) => card.rank === name).length !== 4) continue
      const kind = name === 'V' ? 'carreValets' : name === '9' ? 'carre9' : 'carreAutre'
      add({ kind, rank, length: 4, trump: false, square: true })
    }

    for (const suit of SUITS) {
      const ranks = new Set(hand.filter((card) => card.suit === suit).map((card) => card.rank))
      let length = 0
      for (let i = 0; i <= sequenceOrder.length; i++) {
        if (ranks.has(sequenceOrder[i])) {
          length++
          continue
        }
        if (length >= 3) {
          const kind = length >= 5 ? 'cent' : length === 4 ? 'cinquante' : 'tierce'
          add({ kind, rank: i - 1, length, trump: suit === trump, square: false })
        }
        length = 0
      }
    }
  }
  const [a, b] = strongestByTeam
  let strongest: TeamIdx | 'tie' | null = null
  if (a && b) {
    const difference = compare(a, b)
    strongest = difference === 0 ? 'tie' : difference > 0 ? 0 : 1
  } else if (a || b) strongest = a ? 0 : 1
  return { announcements, strongest }
}
