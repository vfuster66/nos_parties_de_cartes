import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { OnlineGame } from '../../shared/coinche/types'
import type { RoomView } from '../../shared/coinche/views'
import type { Ack, CommandType, SessionGrant } from '../../shared/protocol'
import { onlineServerUrl } from './config'
import { forgetSession, getSession, rememberNickname, saveResult, saveSession } from './local'

export type Connection = 'idle' | 'connecting' | 'online' | 'offline' | 'replaced' | 'kicked' | 'refused'

const uuid = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

export const useOnline = defineStore('online', () => {
  const view = shallowRef<RoomView | null>(null)
  const connection = ref<Connection>('idle')
  /** Commande envoyée dont l'état serveur n'est pas encore revenu. Les boutons restent désactivés. */
  const pending = ref<string | null>(null)
  const error = ref<string | null>(null)
  /** Décalage horloge serveur − horloge locale, pour estimer le temps restant (le serveur reste maître). */
  const clockOffset = ref(0)
  let socket: Socket | null = null
  let currentRoom: string | null = null
  let pendingTimer: ReturnType<typeof setTimeout> | null = null
  let everConnected = false

  const myTeam = computed(() => (view.value?.you.seat == null ? null : ((view.value.you.seat % 2) as 0 | 1)))

  function clearPending(): void {
    pending.value = null
    if (pendingTimer) clearTimeout(pendingTimer)
    pendingTimer = null
  }

  function ensureSocket(): Socket {
    if (socket) return socket
    const s = io(onlineServerUrl ?? '', { autoConnect: false, reconnectionDelayMax: 4000 })
    s.on('state', (v: RoomView) => {
      view.value = v
      clockOffset.value = v.serverNow - Date.now()
      clearPending()
      recordResult(v)
    })
    s.on('connect', () => {
      // Reconnexion automatique (réseau, mise en veille) : on reprend la place avec le jeton de l'appareil.
      if (everConnected && currentRoom) {
        connection.value = 'connecting'
        void resume(currentRoom)
      }
      everConnected = true
    })
    s.on('disconnect', () => {
      if (connection.value === 'online' || connection.value === 'connecting') connection.value = 'offline'
      clearPending()
    })
    s.on('connect_error', () => {
      connection.value = 'offline'
    })
    s.on('replaced', () => {
      connection.value = 'replaced'
      currentRoom = null
    })
    s.on('kicked', () => {
      connection.value = 'kicked'
      if (currentRoom) forgetSession(currentRoom)
      currentRoom = null
    })
    s.on('left', () => {
      currentRoom = null
    })
    socket = s
    return s
  }

  function emit<T>(event: string, payload: unknown, timeoutMs = 8000): Promise<Ack<T>> {
    return new Promise((resolve) => {
      const s = ensureSocket()
      const timer = setTimeout(
        () => resolve({ ok: false, code: 'timeout', message: 'Le serveur ne répond pas.' }),
        timeoutMs,
      )
      s.emit(event, payload, (r: Ack<T>) => {
        clearTimeout(timer)
        resolve(r)
      })
    })
  }

  function connectNow(): Promise<void> {
    const s = ensureSocket()
    if (s.connected) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Serveur injoignable.')), 8000)
      s.once('connect', () => {
        clearTimeout(t)
        resolve()
      })
      s.once('connect_error', () => {
        clearTimeout(t)
        reject(new Error('Serveur injoignable.'))
      })
      s.connect()
    })
  }

  function adopt(g: SessionGrant, nickname: string): void {
    saveSession({ ...g, nickname, savedAt: Date.now() })
    rememberNickname(nickname)
    currentRoom = g.roomId
    connection.value = 'online'
  }

  async function createRoom(nickname: string, game: OnlineGame = 'coinche'): Promise<string | null> {
    error.value = null
    try {
      await connectNow()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
    const r = await emit<{ grant: SessionGrant }>('room:create', { nickname, game })
    if (!r.ok) {
      error.value = r.message
      return null
    }
    adopt(r.grant, nickname)
    return r.grant.roomId
  }

  async function joinRoom(code: string, nickname: string): Promise<string | null> {
    error.value = null
    try {
      await connectNow()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
    const r = await emit<{ grant: SessionGrant }>('room:join', { code, nickname })
    if (!r.ok) {
      error.value = r.message
      return null
    }
    adopt(r.grant, nickname)
    return r.grant.roomId
  }

  /** Reprend la place enregistrée sur cet appareil. Le jeton ne quitte jamais l'appareil que pour cette requête. */
  async function resume(roomId: string): Promise<boolean> {
    error.value = null
    const sess = getSession(roomId)
    if (!sess) {
      connection.value = 'refused'
      error.value = 'Aucune place enregistrée sur cet appareil pour ce salon.'
      return false
    }
    currentRoom = roomId
    try {
      await connectNow()
    } catch (e) {
      error.value = (e as Error).message
      connection.value = 'offline'
      return false
    }
    const r = await emit('room:resume', { roomId, participantId: sess.participantId, token: sess.token })
    if (!r.ok) {
      connection.value = 'refused'
      error.value = r.message
      currentRoom = null
      return false
    }
    connection.value = 'online'
    return true
  }

  /** Envoie une intention. Le serveur décide ; le client attend le nouvel état avant de changer l'affichage. */
  async function send(type: CommandType, extra: Record<string, unknown> = {}): Promise<boolean> {
    if (pending.value) return false // double clic / commande déjà en vol
    const v = view.value
    if (!v || !socket) return false
    error.value = null
    pending.value = type
    pendingTimer = setTimeout(clearPending, 10_000)
    const r = await emit<{ version: number }>('command', {
      type,
      commandId: uuid(),
      expectedVersion: v.version,
      ...extra,
    })
    if (!r.ok) {
      clearPending()
      error.value =
        r.code === 'stale' || r.code === 'stale_contract' ? `${r.message} (l'écran vient d'être mis à jour)` : r.message
      return false
    }
    // Si l'état correspondant est déjà arrivé avant l'accusé, rien d'autre ne le débloquera.
    if (view.value && view.value.version >= r.version) clearPending()
    return true
  }

  function recordResult(v: RoomView): void {
    if (v.status !== 'finished' && v.status !== 'abandoned') return
    const players = v.participants.filter((p) => p.seat != null).map((p) => ({ nickname: p.nickname, seat: p.seat! }))
    const common = {
      roomId: v.roomId,
      status: v.status as 'finished' | 'abandoned',
      endedAt: v.endedAt ?? Date.now(),
      players,
    }
    if (v.tarot) {
      saveResult({
        ...common,
        game: 'tarot',
        name: v.config.gameName || 'Tarot en ligne',
        totals: v.tarot.totals,
        rounds: v.tarot.completed.filter((round) => round.detail).length,
      })
      return
    }
    if (!v.result) return
    saveResult({
      ...common,
      name: v.config.gameName || (v.config.game?.startsWith('belote') ? 'Belote en ligne' : 'Coinche en ligne'),
      teamNames: v.config.teamNames,
      totals: v.result.totals,
      winnerTeam: v.result.winnerTeam,
      myTeam: v.you.seat == null ? null : ((v.you.seat % 2) as 0 | 1),
      rounds: v.rounds.filter((r) => !r.passed).length,
    })
  }

  /** Quitte l'écran (la place reste enregistrée sur l'appareil pour une reprise). */
  function leaveScreen(): void {
    currentRoom = null
    view.value = null
    clearPending()
    socket?.disconnect()
    connection.value = 'idle'
  }

  /** Oublie définitivement la place enregistrée (après abandon, départ volontaire, etc.). */
  function forget(roomId: string): void {
    forgetSession(roomId)
  }

  return {
    view,
    connection,
    pending,
    error,
    clockOffset,
    myTeam,
    createRoom,
    joinRoom,
    resume,
    send,
    leaveScreen,
    forget,
  }
})
