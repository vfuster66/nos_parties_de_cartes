// Outils de test (jamais importés par le code de production) : mélange déterministe et parties préparées.
import type { Command } from '../protocol'
import { applyCommand, newMatch } from './engine'
import type { Ctx } from './engine'
import type { Card, Seat, Suit } from './cards'
import { RANKS, SUITS } from './cards'
import type { MatchState } from './types'

/** PRNG déterministe (mulberry32) → entier uniforme. À n'utiliser qu'en test. */
export function seededRandomInt(seed: number): (n: number) => number {
  let a = seed >>> 0
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n)
  }
}

export const PIDS = ['p0', 'p1', 'p2', 'p3']
export const ctx = (over: Partial<Ctx> = {}): Ctx => ({ now: 1_000_000, paused: false, randomInt: seededRandomInt(1), ...over })

let n = 0
/** Applique une commande en visant automatiquement la version courante. */
export function act(s: MatchState, pid: string, cmd: { type: Command['type'] } & Record<string, unknown>, c: Ctx = ctx()): MatchState {
  return applyCommand(s, pid, { commandId: `c${++n}`, expectedVersion: s.version, ...cmd } as Command, c)
}

/** Salon à quatre joueurs assis et prêts. */
export function lobby(): MatchState {
  let s = newMatch('room1', 'ABCDEFGH', { id: 'p0', nickname: 'Anne', joinedAt: 0 }, 0)
  s.participants.push(...PIDS.slice(1).map((id, i) => ({ id, nickname: ['Bob', 'Cléo', 'Dan'][i], joinedAt: 0 })))
  for (let i = 0; i < 4; i++) {
    s = act(s, PIDS[i], { type: 'takeSeat', seat: i })
    s = act(s, PIDS[i], { type: 'setReady', ready: true })
  }
  return s
}

/** Partie démarrée, donneur = place 3 (donc la place 0 parle et entame en premier). */
export function started(configure: Record<string, unknown> = {}, dealer: Seat = 3): MatchState {
  let s = lobby()
  s = act(s, 'p0', { type: 'configure', firstDealer: dealer, ...configure })
  for (const p of PIDS) s = act(s, p, { type: 'setReady', ready: true })
  return act(s, 'p0', { type: 'start' })
}

export const c = (rank: Card['rank'], suit: Suit): Card => ({ rank, suit })
export function withHands(s: MatchState, hands: Card[][]): MatchState {
  const t = structuredClone(s)
  t.round!.hands = hands
  return t
}

/** Quatre mains de huit cartes : toutes les cartes d'une couleur par place. */
export function suitedHands(order: Suit[]): Card[][] {
  return order.map((suit) => RANKS.map((rank) => ({ rank, suit })))
}
export const ALL_SUITS = SUITS
