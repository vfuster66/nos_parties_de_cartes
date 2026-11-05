// Gestionnaire des salons : identité, présence, pause, minuteries, persistance et diffusion des vues filtrées.
// Tout traitement d'une commande est synchrone (validation → application → écriture SQLite → diffusion) :
// les actions d'un même salon sont donc strictement séquentielles.
import { randomBytes, randomInt as cryptoRandomInt, randomUUID } from 'node:crypto'
import type { Socket } from 'socket.io'
import type { Ack, Command, SessionGrant } from '../../shared/protocol'
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  commandSchema,
  createRoomSchema,
  joinRoomSchema,
  normalizeCode,
  resumeSchema,
} from '../../shared/protocol'
import {
  addParticipant,
  applyCommand,
  ensureHost,
  expireWindow,
  isPaused,
  newMatch,
  pauseWindow,
  resumeWindow,
} from '../../shared/coinche/engine'
import { RuleError } from '../../shared/coinche/types'
import type { MatchState } from '../../shared/coinche/types'
import { buildView } from '../../shared/coinche/views'
import type { Logger } from './logger'
import { SlidingCounter, TokenBucket } from './ratelimit'
import type { Store } from './store'

export interface Deps {
  store: Store
  log: Logger
  now: () => number
  /** Entier uniforme dans [0, n). Production : crypto.randomInt. Un générateur déterministe n'est accepté que hors production. */
  randomInt: (n: number) => number
  trustProxy: boolean
}

interface Session {
  roomId: string
  participantId: string
}
type Sock = Socket & { data: { session?: Session | null; bucket?: TokenBucket } }

interface Room {
  state: MatchState
  sockets: Map<string, Sock>
  timer: NodeJS.Timeout | null
  /** Résultats récents par commande (idempotence : un doublon réseau reçoit le même accusé). */
  seen: Map<string, Ack<{ version: number }>>
}

export const DAY = 86_400_000
const fail = (code: string, message: string): Ack<never> => ({ ok: false, code, message })

export class RoomManager {
  private rooms = new Map<string, Room>()
  private byCode = new Map<string, string>()
  private lookupFailures: SlidingCounter
  private creations: SlidingCounter

  constructor(private d: Deps) {
    this.lookupFailures = new SlidingCounter(10, 10 * 60_000, d.now)
    this.creations = new SlidingCounter(20, 60 * 60_000, d.now)
  }

  // ---------- Démarrage / arrêt ----------

  /** Recharge les parties actives en PAUSE : le délai de surcoinche ne s'écoule pas pendant l'arrêt. */
  restore(lastAliveAt: number): number {
    let n = 0
    for (const st of this.d.store.loadActive()) {
      const paused = pauseWindow(st, Math.min(lastAliveAt, this.d.now()))
      if (paused !== st) this.d.store.saveRoom(paused, this.d.now())
      this.rooms.set(st.id, { state: paused, sockets: new Map(), timer: null, seen: new Map() })
      this.byCode.set(st.code, st.id)
      n++
    }
    return n
  }

  /** Arrêt propre : tous les salons passent en pause (fenêtres de surcoinche suspendues et sauvegardées). */
  shutdown(): void {
    for (const room of this.rooms.values()) {
      if (room.timer) clearTimeout(room.timer)
      room.timer = null
      const paused = pauseWindow(room.state, this.d.now())
      if (paused !== room.state) this.d.store.saveRoom(paused, this.d.now())
      room.state = paused
    }
  }

  get roomCount(): number {
    return this.rooms.size
  }

  // ---------- Utilitaires ----------

  private clientKey(socket: Sock): string {
    if (this.d.trustProxy) {
      const xff = socket.handshake.headers['x-forwarded-for']
      const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim()
      if (first) return first
    }
    return socket.handshake.address
  }

  private connected(room: Room): Set<string> {
    return new Set(room.sockets.keys())
  }

  private genCode(): string {
    for (let i = 0; i < 20; i++) {
      let code = ''
      for (let k = 0; k < CODE_LENGTH; k++) code += CODE_ALPHABET[cryptoRandomInt(CODE_ALPHABET.length)] // toujours cryptographique, même si le mélange est injecté en test
      if (!this.byCode.has(code) && !this.d.store.codeExists(code)) return code
    }
    throw new Error('Impossible de générer un code')
  }

  private newToken(): string {
    return randomBytes(32).toString('base64url')
  }

  private grant(state: MatchState, pid: string, token: string): SessionGrant {
    return { roomId: state.id, code: state.code, participantId: pid, token }
  }

  /** Enregistre un nouvel état : persiste s'il a changé, replanifie la minuterie, diffuse les vues. */
  private commit(room: Room, next: MatchState): void {
    if (next !== room.state) {
      // Écriture AVANT mise à jour de la mémoire : si SQLite échoue, l'état en mémoire reste celui qui est durable,
      // rien n'est diffusé et l'appelant renvoie une erreur (jamais un succès trompeur).
      this.d.store.saveRoom(next, this.d.now())
      room.state = next
    }
    this.schedule(room)
    this.broadcast(room)
  }

  broadcast(room: Room): void {
    const conn = this.connected(room)
    const now = this.d.now()
    for (const [pid, sock] of room.sockets) sock.emit('state', buildView(room.state, pid, conn, now))
  }

  private schedule(room: Room): void {
    if (room.timer) clearTimeout(room.timer)
    room.timer = null
    const w = room.state.round?.window
    if (!w || w.deadlineAt == null) return
    const wait = Math.max(0, w.deadlineAt - this.d.now()) + 5
    room.timer = setTimeout(() => this.tick(room.state.id), wait)
    room.timer.unref?.()
  }

  /** Ferme les fenêtres de surcoinche échues. Appelé par la minuterie ; exposé pour les tests (horloge injectée). */
  tick(roomId: string): void {
    const room = this.rooms.get(roomId)
    if (!room) return
    try {
      const next = expireWindow(room.state, this.d.now())
      if (next !== room.state) this.commit(room, next)
      else this.schedule(room)
    } catch {
      // Appelé depuis une minuterie : une exception ferait tomber le processus. On réessaie dans une seconde.
      this.d.log.error('échéance non enregistrée, nouvel essai', { room: room.state.id.slice(0, 6) })
      if (room.timer) clearTimeout(room.timer)
      room.timer = setTimeout(() => this.tick(roomId), 1000)
      room.timer.unref?.()
    }
  }

  tickAll(): void {
    for (const id of this.rooms.keys()) this.tick(id)
  }

  /** Recalcule hôte et pause à partir de la présence, puis diffuse. */
  private syncPresence(room: Room): void {
    const conn = this.connected(room)
    let s = ensureHost(room.state, conn)
    if (s.status === 'playing') s = isPaused(s, conn) ? pauseWindow(s, this.d.now()) : resumeWindow(s, this.d.now())
    this.commit(room, s)
  }

  private attach(room: Room, pid: string, socket: Sock): void {
    const old = room.sockets.get(pid)
    if (old && old.id !== socket.id) {
      // Remplacement : la connexion la plus récente gagne, l'ancienne est fermée et ne peut plus agir.
      old.data.session = null
      old.emit('replaced')
      old.disconnect(true)
    }
    room.sockets.set(pid, socket)
    socket.data.session = { roomId: room.state.id, participantId: pid }
    this.syncPresence(room)
  }

  /** Salon en mémoire, sinon rechargé depuis SQLite (partie terminée consultée après un redémarrage). */
  private getRoom(id: string): Room | undefined {
    const live = this.rooms.get(id)
    if (live) return live
    const st = this.d.store.loadRoom(id)
    if (!st) return undefined
    const room: Room = { state: st, sockets: new Map(), timer: null, seen: new Map() }
    this.rooms.set(id, room)
    this.byCode.set(st.code, id)
    return room
  }

  // ---------- Entrées de salon ----------

  create(socket: Sock, payload: unknown): Ack<{ grant: SessionGrant }> {
    const key = this.clientKey(socket)
    if (this.creations.isBlocked(key)) return fail('rate_limited', 'Trop de salons créés. Réessayez plus tard.')
    const p = createRoomSchema.safeParse(payload)
    if (!p.success) return fail('invalid', 'Pseudo invalide (1 à 20 caractères).')
    this.creations.record(key)
    const now = this.d.now()
    const pid = randomUUID()
    const token = this.newToken()
    const state = newMatch(
      randomBytes(16).toString('base64url'),
      this.genCode(),
      { id: pid, nickname: p.data.nickname, joinedAt: now },
      now,
    )
    this.d.store.db.transaction(() => {
      this.d.store.insertRoom(state, now)
      this.d.store.setToken(state.id, pid, token)
    })()
    const room: Room = { state, sockets: new Map(), timer: null, seen: new Map() }
    this.rooms.set(state.id, room)
    this.byCode.set(state.code, state.id)
    this.attach(room, pid, socket)
    this.d.log.info('salon créé', { room: state.id.slice(0, 6) })
    return { ok: true, grant: this.grant(state, pid, token) }
  }

  join(socket: Sock, payload: unknown): Ack<{ grant: SessionGrant }> {
    const key = this.clientKey(socket)
    if (this.lookupFailures.isBlocked(key))
      return fail('rate_limited', 'Trop de tentatives. Patientez quelques minutes.')
    const p = joinRoomSchema.safeParse(payload)
    if (!p.success) return fail('invalid', 'Code ou pseudo invalide.')
    const roomId = this.byCode.get(normalizeCode(p.data.code))
    const room = roomId ? this.rooms.get(roomId) : undefined
    if (!room) {
      this.lookupFailures.record(key)
      return fail('not_found', 'Salon introuvable. Vérifiez le code.')
    }
    const pid = randomUUID()
    const token = this.newToken()
    try {
      const next = addParticipant(room.state, { id: pid, nickname: p.data.nickname, joinedAt: this.d.now() })
      this.d.store.db.transaction(() => {
        this.d.store.setToken(next.id, pid, token)
        this.d.store.saveRoom(next, this.d.now())
      })()
      room.state = next // seulement une fois l'écriture réussie
    } catch (e) {
      if (e instanceof RuleError) return fail(e.code, e.message)
      throw e
    }
    this.attach(room, pid, socket)
    this.d.log.info('participant entré', { room: room.state.id.slice(0, 6) })
    return { ok: true, grant: this.grant(room.state, pid, token) }
  }

  resume(socket: Sock, payload: unknown): Ack<{ version: number }> {
    const key = this.clientKey(socket)
    if (this.lookupFailures.isBlocked(key))
      return fail('rate_limited', 'Trop de tentatives. Patientez quelques minutes.')
    const p = resumeSchema.safeParse(payload)
    if (!p.success) return fail('invalid', 'Session invalide.')
    const room = this.getRoom(p.data.roomId)
    const ok = room && this.d.store.verifyToken(p.data.roomId, p.data.participantId, p.data.token)
    if (!room || !ok || !room.state.participants.some((x) => x.id === p.data.participantId)) {
      this.lookupFailures.record(key)
      return fail(
        'unauthorized',
        'Impossible de reprendre cette place. Le secret de reconnexion de cet appareil est absent ou invalide.',
      )
    }
    this.attach(room, p.data.participantId, socket)
    return { ok: true, version: room.state.version }
  }

  // ---------- Commandes ----------

  command(socket: Sock, payload: unknown): Ack<{ version: number }> {
    const session = socket.data.session
    if (!session) return fail('unauthorized', 'Connexion non authentifiée ou remplacée.')
    if (!(socket.data.bucket ??= new TokenBucket(30, 10, this.d.now)).take())
      return fail('rate_limited', 'Trop de commandes : ralentissez.')
    const parsed = commandSchema.safeParse(payload)
    if (!parsed.success) return fail('invalid', 'Commande invalide.')
    const cmd: Command = parsed.data
    const room = this.rooms.get(session.roomId)
    if (!room || room.sockets.get(session.participantId)?.id !== socket.id)
      return fail('unauthorized', 'Connexion non authentifiée ou remplacée.')

    const seenKey = `${session.participantId}:${cmd.commandId}`
    const prior = room.seen.get(seenKey)
    if (prior) return prior // doublon réseau / double clic : même réponse, aucun effet de plus

    const remember = (ack: Ack<{ version: number }>): Ack<{ version: number }> => {
      room.seen.set(seenKey, ack)
      if (room.seen.size > 500) room.seen.delete(room.seen.keys().next().value as string)
      return ack
    }

    // Les échéances passées sont appliquées AVANT la commande.
    const expired = expireWindow(room.state, this.d.now())
    if (expired !== room.state) {
      this.commit(room, expired)
      if (cmd.type === 'surcoinche' || cmd.type === 'acceptCoinche')
        return fail('window_closed', 'Le délai de surcoinche est écoulé : le contrat reste coinché.')
    }

    const conn = this.connected(room)
    try {
      let next = applyCommand(room.state, session.participantId, cmd, {
        now: this.d.now(),
        paused: isPaused(room.state, conn),
        randomInt: this.d.randomInt,
      })
      if (cmd.type === 'kick' || cmd.type === 'leaveRoom') {
        const gone = cmd.type === 'kick' ? cmd.participantId : session.participantId
        const stay = this.connected(room)
        stay.delete(gone)
        next = ensureHost(next, stay)
        // Jeton et état changent dans la même transaction : tout ou rien.
        this.d.store.db.transaction(() => {
          this.d.store.removeToken(room.state.id, gone)
          this.d.store.saveRoom(next, this.d.now())
        })()
        room.state = next
        const gs = room.sockets.get(gone)
        room.sockets.delete(gone)
        if (gs) {
          gs.data.session = null
          gs.emit(cmd.type === 'kick' ? 'kicked' : 'left')
          if (cmd.type === 'kick') gs.disconnect(true)
        }
        this.schedule(room)
        this.broadcast(room)
      } else {
        next = ensureHost(next, conn)
        this.commit(room, next)
      }
      this.d.log.info('commande', { room: room.state.id.slice(0, 6), type: cmd.type, version: next.version })
      return remember({ ok: true, version: next.version })
    } catch (e) {
      if (e instanceof RuleError) {
        this.d.log.warn('commande refusée', { room: room.state.id.slice(0, 6), type: cmd.type, code: e.code })
        // Un refus n'est pas mémorisé comme définitif : un « stale » peut être retenté avec la nouvelle version.
        return fail(e.code, e.message)
      }
      this.d.log.error('erreur interne', { room: room.state.id.slice(0, 6), type: cmd.type })
      return fail('internal', 'Erreur interne du serveur.')
    }
  }

  disconnect(socket: Sock): void {
    const session = socket.data.session
    if (!session) return
    const room = this.rooms.get(session.roomId)
    if (!room || room.sockets.get(session.participantId)?.id !== socket.id) return
    room.sockets.delete(session.participantId)
    this.syncPresence(room)
    this.evictIfIdle(room)
  }

  /**
   * Une partie terminée ou abandonnée que plus personne ne regarde n'a pas besoin de rester en mémoire :
   * elle est rechargée depuis SQLite si quelqu'un revient consulter le résultat.
   */
  private evictIfIdle(room: Room): void {
    const st = room.state
    if (room.sockets.size > 0 || (st.status !== 'finished' && st.status !== 'abandoned')) return
    if (room.timer) clearTimeout(room.timer)
    this.rooms.delete(st.id)
    this.byCode.delete(st.code)
  }

  /** Nettoyage périodique : salons terminés anciens et salons d'attente abandonnés. */
  purge(): void {
    const removed = this.d.store.purge(this.d.now(), 30 * DAY, 2 * DAY)
    for (const [id, room] of this.rooms) {
      const st = room.state
      if (
        room.sockets.size === 0 &&
        (st.status === 'finished' ||
          st.status === 'abandoned' ||
          (st.status === 'lobby' && this.d.store.loadRoom(id) === null))
      ) {
        if (room.timer) clearTimeout(room.timer)
        this.rooms.delete(id)
        this.byCode.delete(st.code)
      }
    }
    this.lookupFailures.sweep()
    this.creations.sweep()
    if (removed) this.d.log.info('purge', { salons: removed })
  }
}
