import { defineStore } from 'pinia'
import * as idb from '../db/idb'
import { applyMerge, buildBackup, defaultPreferences, planMerge, teamKey } from '../db/backup'
import type { BackupData, MergePlan } from '../db/backup'
import { computeGame, recomputeDealers } from '../engine/game'
import type { Deal, Draft, Evening, Game, GameStatus, Player, Preferences, Team } from '../engine/model'
import { GAME_LABELS } from '../engine/types'
import type { GameKind, Rules } from '../engine/types'
import { teamLabel } from '../engine/stats'

const uid = (): string => crypto.randomUUID()
const now = (): string => new Date().toISOString()
export const todayIso = (): string => new Date().toISOString().slice(0, 10)

export interface NewGameOptions {
  kind: GameKind
  name?: string
  eveningId: string | null
  /** Coinche/belote : joueurs des équipes A et B. Tarot : ordre autour de la table. */
  teamA?: [string, string]
  teamB?: [string, string]
  teamNames?: [string, string]
  tarotPlayers?: string[]
  firstDealerId: string
  rules: Rules
}

interface UndoEntry { gameId: string; label: string; before: Game }

export const useData = defineStore('data', {
  state: () => ({
    ready: false,
    loadError: null as string | null,
    saveError: null as string | null,
    players: [] as Player[],
    teams: [] as Team[],
    evenings: [] as Evening[],
    games: [] as Game[],
    drafts: [] as Draft[],
    preferences: defaultPreferences() as Preferences,
    undoStack: [] as UndoEntry[],
  }),
  getters: {
    player: (s) => (id: string) => s.players.find((p) => p.id === id),
    game: (s) => (id: string) => s.games.find((g) => g.id === id),
    evening: (s) => (id: string) => s.evenings.find((e) => e.id === id),
    team: (s) => (id: string) => s.teams.find((t) => t.id === id),
    stats: (s) => ({ players: s.players, teams: s.teams, games: s.games }),
    playerName() {
      return (id: string) => this.players.find((p) => p.id === id)?.name ?? 'Joueur supprimé'
    },
    teamName() {
      return (id: string) => {
        const t = this.teams.find((x) => x.id === id)
        return t ? teamLabel(this.stats, t) : 'Équipe inconnue'
      }
    },
    /** Nom d'une équipe (0/1) dans une partie de coinche/belote. */
    gameTeamName() {
      return (g: Game, idx: 0 | 1) => (g.teamIds ? this.teamName(g.teamIds[idx]) : '')
    },
    lastActiveGame: (s) =>
      [...s.games].filter((g) => g.status === 'in_progress').sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0],
    backupData: (s): BackupData => ({
      players: s.players, teams: s.teams, evenings: s.evenings, games: s.games, preferences: s.preferences,
    }),
  },
  actions: {
    async load() {
      try {
        const [players, teams, evenings, games, drafts, meta] = await Promise.all([
          idb.getAll<Player>('players'), idb.getAll<Team>('teams'), idb.getAll<Evening>('evenings'),
          idb.getAll<Game>('games'), idb.getAll<Draft>('drafts'), idb.getAll<{ key: string; value: Preferences }>('meta'),
        ])
        this.players = players; this.teams = teams; this.evenings = evenings; this.games = games; this.drafts = drafts
        const pref = meta.find((m) => m.key === 'preferences')
        if (pref) this.preferences = pref.value
      } catch (e) {
        this.loadError = msg(e)
      } finally {
        this.ready = true
      }
    },

    /** Exécute une écriture ; en cas d'échec, mémorise l'erreur (affichée à l'écran) et la relance. */
    async guard<T>(fn: () => Promise<T>): Promise<T> {
      try {
        const r = await fn()
        this.saveError = null
        return r
      } catch (e) {
        this.saveError = `La sauvegarde a échoué : ${msg(e)} Vos dernières modifications ne sont peut-être pas enregistrées.`
        throw e
      }
    },

    // ---------- Joueurs ----------
    async addPlayer(name: string): Promise<Player> {
      const p: Player = { id: uid(), name: name.trim(), createdAt: now() }
      await this.guard(() => idb.put('players', p))
      this.players.push(p)
      return p
    },
    async renamePlayer(id: string, name: string) {
      const p = this.players.find((x) => x.id === id)
      if (!p) return
      const next = { ...p, name: name.trim() }
      await this.guard(() => idb.put('players', next))
      Object.assign(p, next)
    },
    playerInGames(id: string): boolean {
      return this.games.some((g) => g.playerIds.includes(id))
    },
    async deletePlayer(id: string) {
      if (this.playerInGames(id)) throw new Error('Ce joueur participe à des parties : il ne peut pas être supprimé.')
      const teamOps = this.teams.filter((t) => t.memberIds.includes(id))
      await this.guard(() => idb.batch([{ store: 'players', remove: id }, ...teamOps.map((t) => ({ store: 'teams' as const, remove: t.id }))]))
      this.players = this.players.filter((p) => p.id !== id)
      this.teams = this.teams.filter((t) => !t.memberIds.includes(id))
    },
    /** Joueurs ayant un nom proche (insensible à la casse et aux accents), pour avertir sans bloquer. */
    similarPlayers(name: string, exceptId?: string): Player[] {
      const k = normalize(name)
      return k ? this.players.filter((p) => p.id !== exceptId && normalize(p.name) === k) : []
    },

    // ---------- Équipes ----------
    findTeam(a: string, b: string): Team | undefined {
      const k = teamKey([a, b])
      return this.teams.find((t) => teamKey(t.memberIds) === k)
    },
    async ensureTeam(a: string, b: string, name?: string): Promise<Team> {
      const existing = this.findTeam(a, b)
      const nm = name?.trim() || undefined
      if (existing) {
        if (nm && nm !== existing.name) await this.renameTeam(existing.id, nm)
        return existing
      }
      const t: Team = { id: uid(), memberIds: [a, b], name: nm, createdAt: now() }
      await this.guard(() => idb.put('teams', t))
      this.teams.push(t)
      return t
    },
    async renameTeam(id: string, name: string) {
      const t = this.teams.find((x) => x.id === id)
      if (!t) return
      const next = { ...t, name: name.trim() || undefined }
      await this.guard(() => idb.put('teams', next))
      Object.assign(t, next)
    },

    // ---------- Soirées ----------
    async addEvening(name: string, date: string): Promise<Evening> {
      const e: Evening = { id: uid(), name: name.trim() || undefined, date, createdAt: now() }
      await this.guard(() => idb.put('evenings', e))
      this.evenings.push(e)
      return e
    },
    async updateEvening(id: string, name: string, date: string) {
      const e = this.evenings.find((x) => x.id === id)
      if (!e) return
      const next = { ...e, name: name.trim() || undefined, date }
      await this.guard(() => idb.put('evenings', next))
      Object.assign(e, next)
    },
    async deleteEvening(id: string) {
      const detached = this.games.filter((g) => g.eveningId === id).map((g) => ({ ...g, eveningId: null }))
      await this.guard(() => idb.batch([{ store: 'evenings', remove: id }, ...detached.map((g) => ({ store: 'games' as const, put: g }))]))
      this.evenings = this.evenings.filter((e) => e.id !== id)
      for (const d of detached) Object.assign(this.games.find((g) => g.id === d.id)!, d)
    },
    eveningGames(id: string): Game[] {
      return this.games.filter((g) => g.eveningId === id).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    },

    // ---------- Parties ----------
    async createGame(o: NewGameOptions): Promise<Game> {
      let playerIds: string[]
      let teamIds: [string, string] | null = null
      if (o.kind === 'tarot') playerIds = o.tarotPlayers ?? []
      else {
        const [a1, a2] = o.teamA ?? ['', '']
        const [b1, b2] = o.teamB ?? ['', '']
        const ta = await this.ensureTeam(a1, a2, o.teamNames?.[0])
        const tb = await this.ensureTeam(b1, b2, o.teamNames?.[1])
        teamIds = [ta.id, tb.id]
        playerIds = [a1, b1, a2, b2]
      }
      const same = this.games.filter((g) => g.kind === o.kind && g.eveningId === o.eveningId).length
      const g: Game = {
        id: uid(), kind: o.kind, name: o.name?.trim() || undefined,
        autoName: `${GAME_LABELS[o.kind]} — Partie ${same + 1}`,
        eveningId: o.eveningId, startedAt: now(), endedAt: null, status: 'in_progress',
        playerIds, teamIds, firstDealerId: o.firstDealerId, rules: JSON.parse(JSON.stringify(o.rules)) as Rules, deals: [],
      }
      await this.guard(() => idb.put('games', g))
      this.games.push(g)
      return g
    },
    async updateGame(id: string, patch: (g: Game) => Game, undoLabel?: string) {
      const idx = this.games.findIndex((g) => g.id === id)
      if (idx < 0) return
      const before = this.games[idx]
      const next = patch(JSON.parse(JSON.stringify(before)) as Game)
      await this.guard(() => idb.put('games', next))
      if (undoLabel) this.undoStack.push({ gameId: id, label: undoLabel, before })
      this.games[idx] = next
    },
    async saveDeal(gameId: string, deal: Deal) {
      await this.updateGame(
        gameId,
        (g) => {
          const i = g.deals.findIndex((d) => d.id === deal.id)
          if (i >= 0) g.deals[i] = deal
          else g.deals.push(deal)
          return g
        },
        this.game(gameId)?.deals.some((d) => d.id === deal.id) ? 'Modification d’une donne' : deal.passed ? 'Donne passée' : 'Nouvelle donne',
      )
    },
    async deleteDeal(gameId: string, dealId: string) {
      await this.updateGame(gameId, (g) => ({ ...g, deals: g.deals.filter((d) => d.id !== dealId) }), 'Suppression d’une donne')
    },
    async setStatus(gameId: string, status: GameStatus) {
      await this.updateGame(
        gameId,
        (g) => ({ ...g, status, endedAt: status === 'in_progress' ? null : now() }),
        status === 'in_progress' ? 'Réouverture' : status === 'finished' ? 'Fin de partie' : 'Abandon',
      )
    },
    async renameGame(gameId: string, name: string) {
      await this.updateGame(gameId, (g) => ({ ...g, name: name.trim() || undefined }))
    },
    async moveGameToEvening(gameId: string, eveningId: string | null) {
      await this.updateGame(gameId, (g) => ({ ...g, eveningId }))
    },
    async recomputeDealers(gameId: string) {
      await this.updateGame(gameId, (g) => recomputeDealers(g), 'Recalcul des donneurs')
    },
    async deleteGame(gameId: string) {
      const dr = this.drafts.filter((d) => d.gameId === gameId)
      await this.guard(() => idb.batch([{ store: 'games', remove: gameId }, ...dr.map((d) => ({ store: 'drafts' as const, remove: d.key }))]))
      this.games = this.games.filter((g) => g.id !== gameId)
      this.drafts = this.drafts.filter((d) => d.gameId !== gameId)
      this.undoStack = this.undoStack.filter((u) => u.gameId !== gameId)
    },
    lastUndo(gameId: string): UndoEntry | undefined {
      return [...this.undoStack].reverse().find((u) => u.gameId === gameId)
    },
    async undo(gameId: string) {
      const u = this.lastUndo(gameId)
      if (!u) return
      const idx = this.games.findIndex((g) => g.id === gameId)
      await this.guard(() => idb.put('games', u.before))
      this.games[idx] = u.before
      this.undoStack.splice(this.undoStack.lastIndexOf(u), 1)
    },
    state(gameId: string) {
      const g = this.game(gameId)
      return g ? computeGame(g) : null
    },

    // ---------- Brouillons ----------
    getDraft(gameId: string, dealId: string | null): Draft | undefined {
      const key = `${gameId}::${dealId ?? 'new'}`
      return this.drafts.find((d) => d.key === key)
    },
    async saveDraft(gameId: string, dealId: string | null, form: unknown) {
      const key = `${gameId}::${dealId ?? 'new'}`
      const d: Draft = { key, gameId, dealId, form: JSON.parse(JSON.stringify(form)), updatedAt: now() }
      await this.guard(() => idb.put('drafts', d))
      const i = this.drafts.findIndex((x) => x.key === key)
      if (i >= 0) this.drafts[i] = d
      else this.drafts.push(d)
    },
    async deleteDraft(gameId: string, dealId: string | null) {
      const key = `${gameId}::${dealId ?? 'new'}`
      if (!this.drafts.some((d) => d.key === key)) return
      await this.guard(() => idb.remove('drafts', key))
      this.drafts = this.drafts.filter((d) => d.key !== key)
    },

    // ---------- Préférences ----------
    async setDefaultRules(kind: GameKind, rules: Rules) {
      const next: Preferences = { defaults: { ...this.preferences.defaults, [kind]: rules } }
      await this.guard(() => idb.put('meta', { key: 'preferences', value: next }))
      this.preferences = next
    },

    // ---------- Sauvegarde ----------
    exportJson(): string {
      return JSON.stringify(buildBackup(this.backupData), null, 2)
    },
    planImport(incoming: BackupData): MergePlan {
      return planMerge(this.backupData, incoming, (kind, x: never) => {
        const v = x as Record<string, unknown>
        if (kind === 'players') return `Joueur « ${String(v.name)} »`
        if (kind === 'teams') return `Équipe « ${teamLabel(this.stats, v as unknown as Team)} »`
        if (kind === 'evenings') return `Soirée « ${String(v.name ?? v.date)} »`
        return `Partie « ${String(v.name ?? v.autoName)} »`
      })
    },
    /** Fusion atomique : tout est écrit dans une seule transaction ou rien. */
    async importMerge(incoming: BackupData, replace: Set<string>) {
      const merged = applyMerge(this.backupData, incoming, replace)
      await this.writeAll(merged, false)
    },
    async importReplaceAll(incoming: BackupData) {
      await this.writeAll(incoming, true)
    },
    async writeAll(d: BackupData, dropDrafts: boolean) {
      const prefs = d.preferences ?? defaultPreferences()
      await this.guard(() =>
        idb.replaceAll({
          players: d.players, teams: d.teams, evenings: d.evenings, games: d.games,
          drafts: dropDrafts ? [] : this.drafts, meta: [{ key: 'preferences', value: prefs }],
        }),
      )
      this.players = d.players; this.teams = d.teams; this.evenings = d.evenings; this.games = d.games
      this.preferences = prefs
      if (dropDrafts) this.drafts = []
      this.undoStack = []
    },
    async clearAll() {
      await this.writeAll({ players: [], teams: [], evenings: [], games: [], preferences: defaultPreferences() }, true)
    },
  },
})

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const normalize = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
