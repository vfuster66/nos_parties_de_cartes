// Stockage local du jeu en ligne (appareil seulement). Séparé d'IndexedDB et de l'export du compteur :
// les jetons de reconnexion n'apparaissent donc jamais dans un fichier d'export partageable.
import type { Seat, TeamIdx } from '../../shared/coinche/cards'

const SESSIONS = 'ncp.online.sessions.v1'
const RESULTS = 'ncp.online.results.v1'
const NICK = 'ncp.online.nickname.v1'

export interface StoredSession {
  roomId: string
  code: string
  participantId: string
  /** Secret de reconnexion. Ne jamais l'afficher, l'exporter ni le mettre dans un lien. */
  token: string
  nickname: string
  savedAt: number
}

export interface OnlineResult {
  /** Identifiant stable de la partie en ligne (anti-doublon lors des reconnexions). */
  roomId: string
  name: string
  status: 'finished' | 'abandoned'
  endedAt: number
  teamNames: [string, string]
  players: { nickname: string; seat: Seat }[]
  totals: [number, number]
  winnerTeam: TeamIdx | null
  myTeam: TeamIdx | null
  rounds: number
}

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* stockage plein ou interdit : le jeu reste possible, la reprise automatique non */
  }
}

export const loadSessions = (): Record<string, StoredSession> => read(SESSIONS, {})
export const getSession = (roomId: string): StoredSession | null => loadSessions()[roomId] ?? null
export function saveSession(s: StoredSession): void {
  write(SESSIONS, { ...loadSessions(), [s.roomId]: s })
}
export function forgetSession(roomId: string): void {
  const all = loadSessions()
  delete all[roomId]
  write(SESSIONS, all)
}

export const loadResults = (): OnlineResult[] => read<OnlineResult[]>(RESULTS, [])
/** Ajoute ou met à jour (par identifiant de partie) : jamais de doublon. */
export function saveResult(r: OnlineResult): void {
  const list = loadResults().filter((x) => x.roomId !== r.roomId)
  write(RESULTS, [r, ...list].slice(0, 200))
}

export const lastNickname = (): string => read<string>(NICK, '')
export const rememberNickname = (n: string): void => write(NICK, n)
