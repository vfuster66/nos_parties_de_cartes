// Persistance SQLite. Les jetons de reconnexion ne sont conservés que sous forme d'empreinte SHA-256,
// dans une table distincte de l'état de la partie.
import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import type { MatchState } from '../../shared/coinche/types'

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

export class Store {
  readonly db: Database.Database

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = FULL') // un état accepté est durable avant l'accusé de réception
    this.db.pragma('foreign_keys = ON')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        version INTEGER NOT NULL,
        state TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tokens (
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        participant_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        PRIMARY KEY (room_id, participant_id)
      );
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `)
  }

  insertRoom(state: MatchState, now: number): void {
    this.db
      .prepare('INSERT INTO rooms (id, code, status, version, state, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(state.id, state.code, state.status, state.version, JSON.stringify(state), state.createdAt, now)
  }

  saveRoom(state: MatchState, now: number): void {
    this.db
      .prepare('UPDATE rooms SET status=?, version=?, state=?, updated_at=? WHERE id=?')
      .run(state.status, state.version, JSON.stringify(state), now, state.id)
  }

  codeExists(code: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM rooms WHERE code=?').get(code)
  }

  findByCode(code: string): MatchState | null {
    const row = this.db.prepare('SELECT state FROM rooms WHERE code=?').get(code) as { state: string } | undefined
    return row ? (JSON.parse(row.state) as MatchState) : null
  }

  loadActive(): MatchState[] {
    const rows = this.db.prepare("SELECT state FROM rooms WHERE status IN ('lobby','playing')").all() as {
      state: string
    }[]
    return rows.map((r) => JSON.parse(r.state) as MatchState)
  }

  loadRoom(id: string): MatchState | null {
    const row = this.db.prepare('SELECT state FROM rooms WHERE id=?').get(id) as { state: string } | undefined
    return row ? (JSON.parse(row.state) as MatchState) : null
  }

  setToken(roomId: string, participantId: string, token: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO tokens (room_id, participant_id, token_hash) VALUES (?,?,?)')
      .run(roomId, participantId, hashToken(token))
  }

  removeToken(roomId: string, participantId: string): void {
    this.db.prepare('DELETE FROM tokens WHERE room_id=? AND participant_id=?').run(roomId, participantId)
  }

  verifyToken(roomId: string, participantId: string, token: string): boolean {
    const row = this.db
      .prepare('SELECT token_hash FROM tokens WHERE room_id=? AND participant_id=?')
      .get(roomId, participantId) as { token_hash: string } | undefined
    if (!row) return false
    const a = Buffer.from(row.token_hash, 'hex')
    const b = Buffer.from(hashToken(token), 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key=?').get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  setMeta(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?,?)').run(key, value)
  }

  /** Supprime les salons terminés/abandonnés anciens et les salons d'attente délaissés. */
  purge(now: number, finishedMaxAgeMs: number, lobbyMaxAgeMs: number): number {
    const r = this.db
      .prepare(
        "DELETE FROM rooms WHERE (status IN ('finished','abandoned') AND updated_at < ?) OR (status='lobby' AND updated_at < ?)",
      )
      .run(now - finishedMaxAgeMs, now - lobbyMaxAgeMs)
    return r.changes
  }

  ping(): boolean {
    return this.db.prepare('SELECT 1 AS ok').get() !== undefined
  }

  /** Sauvegarde cohérente (API de sauvegarde en ligne de SQLite), sûre pendant les écritures. */
  backup(dest: string): Promise<unknown> {
    return this.db.backup(dest)
  }

  close(): void {
    this.db.close()
  }
}
