import type { BeloteInput } from '../engine/belote'
import type { CoincheInput } from '../engine/coinche'
import type { Deal, Evening, Game, Player, Preferences, Team } from '../engine/model'
import type { TarotInput } from '../engine/tarot'
import { defaultRules } from '../engine/types'

export const APP_ID = 'nos-parties-de-cartes'
export const SCHEMA_VERSION = 1

export interface BackupData {
  players: Player[]
  teams: Team[]
  evenings: Evening[]
  games: Game[]
  preferences: Preferences
}
export interface BackupFile {
  app: typeof APP_ID
  schemaVersion: number
  exportedAt: string
  data: BackupData
}

export const defaultPreferences = (): Preferences => ({
  defaults: { coinche: defaultRules('coinche'), belote: defaultRules('belote'), tarot: defaultRules('tarot') },
})

export function buildBackup(data: BackupData): BackupFile {
  return { app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data }
}

/**
 * Migrations successives : MIGRATIONS[n] transforme un fichier de version n en version n+1.
 * Ajouter une entrée lorsque SCHEMA_VERSION augmente.
 */
const MIGRATIONS: Record<number, (f: Record<string, unknown>) => Record<string, unknown>> = {}

export function migrate(raw: unknown): { file?: BackupFile; errors: string[] } {
  if (!isObj(raw)) return { errors: ['Le fichier n’est pas un objet JSON valide.'] }
  if (raw.app !== APP_ID) return { errors: ['Ce fichier n’est pas une sauvegarde de « Nos parties de cartes ».'] }
  let v = raw.schemaVersion
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1)
    return { errors: ['Version de sauvegarde absente ou invalide.'] }
  if (v > SCHEMA_VERSION)
    return {
      errors: [
        `Cette sauvegarde (version ${v}) vient d’une version plus récente de l’application (version ${SCHEMA_VERSION}).`,
      ],
    }
  let cur: Record<string, unknown> = raw
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS[v]
    if (!m) return { errors: [`Aucune migration disponible depuis la version ${v}.`] }
    cur = m(cur)
    v++
  }
  const errors = validateData(cur.data)
  if (errors.length) return { errors }
  return { file: cur as unknown as BackupFile, errors: [] }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0

/** Validation de schéma et de cohérence référentielle d'un jeu de données. */
export function validateData(d: unknown): string[] {
  const errs: string[] = []
  if (!isObj(d)) return ['Données absentes.']
  for (const k of ['players', 'teams', 'evenings', 'games'] as const)
    if (!Array.isArray(d[k])) errs.push(`Collection « ${k} » manquante.`)
  if (errs.length) return errs
  const players = d.players as Player[]
  const teams = d.teams as Team[]
  const evenings = d.evenings as Evening[]
  const games = d.games as Game[]
  const ids = (arr: { id: string }[], label: string) => {
    const s = new Set<string>()
    for (const x of arr) {
      if (!isObj(x) || !isStr(x.id)) errs.push(`${label} : identifiant manquant.`)
      else if (s.has(x.id)) errs.push(`${label} : identifiant en double (${x.id}).`)
      else s.add(x.id)
    }
    return s
  }
  const pIds = ids(players, 'Joueurs')
  const tIds = ids(teams, 'Équipes')
  const eIds = ids(evenings, 'Soirées')
  ids(games, 'Parties')
  for (const p of players) if (!isStr(p.name)) errs.push(`Joueur ${p.id} sans nom.`)
  for (const t of teams) {
    if (
      !Array.isArray(t.memberIds) ||
      t.memberIds.length !== 2 ||
      t.memberIds[0] === t.memberIds[1] ||
      !t.memberIds.every((m) => pIds.has(m))
    )
      errs.push(`Équipe ${t.id} : membres invalides.`)
  }
  for (const e of evenings) if (!isStr(e.date)) errs.push(`Soirée ${e.id} sans date.`)
  for (const g of games) errs.push(...validateGame(g, pIds, tIds, eIds))
  const pref = (d as { preferences?: unknown }).preferences
  if (pref !== undefined && (!isObj(pref) || !isObj(pref.defaults))) errs.push('Préférences invalides.')
  return errs
}

export function validateGame(g: Game, pIds: Set<string>, tIds: Set<string>, eIds: Set<string>): string[] {
  const errs: string[] = []
  const n = `Partie ${g.id}`
  if (!['coinche', 'belote', 'tarot'].includes(g.kind)) return [`${n} : jeu inconnu.`]
  if (!['in_progress', 'finished', 'abandoned'].includes(g.status)) errs.push(`${n} : état inconnu.`)
  if (!Array.isArray(g.playerIds) || new Set(g.playerIds).size !== g.playerIds.length)
    return [`${n} : joueurs en double ou absents.`]
  const size = g.playerIds.length
  if (g.kind === 'tarot' ? size < 3 || size > 6 : size !== 4) errs.push(`${n} : nombre de joueurs invalide.`)
  if (!g.playerIds.every((p) => pIds.has(p))) errs.push(`${n} : joueur inconnu.`)
  if (g.kind !== 'tarot' && (!Array.isArray(g.teamIds) || !g.teamIds.every((t) => tIds.has(t))))
    errs.push(`${n} : équipe inconnue.`)
  if (g.eveningId && !eIds.has(g.eveningId)) errs.push(`${n} : soirée inconnue.`)
  if (!g.playerIds.includes(g.firstDealerId)) errs.push(`${n} : premier donneur invalide.`)
  if (!isObj(g.rules) || g.rules.kind !== g.kind) errs.push(`${n} : règles invalides.`)
  if (!Array.isArray(g.deals)) return [...errs, `${n} : donnes absentes.`]
  const dealIds = new Set<string>()
  for (const d of g.deals as Deal[]) {
    if (!isStr(d.id) || dealIds.has(d.id)) errs.push(`${n} : identifiant de donne invalide ou en double.`)
    dealIds.add(d.id)
    if (!g.playerIds.includes(d.dealerId)) errs.push(`${n} : donneur d’une donne inconnu.`)
    if (!d.passed) {
      const inp = d.input as (CoincheInput | BeloteInput | TarotInput) | null
      if (!isObj(inp) || !g.playerIds.includes((inp as { takerId: string }).takerId))
        errs.push(`${n} : preneur invalide dans une donne.`)
      else
        for (const v of Object.values(inp))
          if (typeof v === 'number' && !Number.isFinite(v)) errs.push(`${n} : valeur non finie dans une donne.`)
    }
  }
  return errs
}

export type Conflict = { kind: 'players' | 'teams' | 'evenings' | 'games'; id: string; label: string }

const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    isObj(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x,
  )

export interface MergePlan {
  add: Record<Conflict['kind'], string[]>
  identical: number
  conflicts: Conflict[]
}

/** Compare l'import à l'existant : ajouts, identiques (ignorés), conflits (même id, contenu différent). */
export function planMerge(
  current: BackupData,
  incoming: BackupData,
  label: (kind: Conflict['kind'], x: never) => string,
): MergePlan {
  const plan: MergePlan = { add: { players: [], teams: [], evenings: [], games: [] }, identical: 0, conflicts: [] }
  for (const kind of ['players', 'teams', 'evenings', 'games'] as const) {
    const cur = new Map((current[kind] as { id: string }[]).map((x) => [x.id, x]))
    for (const x of incoming[kind] as { id: string }[]) {
      const ex = cur.get(x.id)
      if (!ex) plan.add[kind].push(x.id)
      else if (stable(ex) === stable(x)) plan.identical++
      else plan.conflicts.push({ kind, id: x.id, label: label(kind, x as never) })
    }
  }
  return plan
}

export const teamKey = (memberIds: string[]): string => [...memberIds].sort().join('|')

/**
 * Applique la fusion ; `replace` liste les conflits (`kind:id`) à écraser, les autres existants sont conservés.
 * Une équipe importée ayant les mêmes membres qu'une équipe existante (autre identifiant) n'est pas dupliquée :
 * les parties importées sont rattachées à l'équipe existante.
 */
export function applyMerge(current: BackupData, incoming: BackupData, replace: Set<string>): BackupData {
  const out: BackupData = JSON.parse(JSON.stringify(current)) as BackupData
  const inc: BackupData = JSON.parse(JSON.stringify(incoming)) as BackupData
  const remap = new Map<string, string>()
  const byMembers = new Map(out.teams.map((t) => [teamKey(t.memberIds), t.id]))
  inc.teams = inc.teams.filter((t) => {
    const same = byMembers.get(teamKey(t.memberIds))
    if (same && same !== t.id && !out.teams.some((x) => x.id === t.id)) {
      remap.set(t.id, same)
      return false
    }
    return true
  })
  for (const g of inc.games) if (g.teamIds) g.teamIds = g.teamIds.map((t) => remap.get(t) ?? t) as [string, string]
  for (const kind of ['players', 'teams', 'evenings', 'games'] as const) {
    const list = out[kind] as { id: string }[]
    for (const x of inc[kind] as { id: string }[]) {
      const i = list.findIndex((y) => y.id === x.id)
      if (i < 0) list.push(x)
      else if (replace.has(`${kind}:${x.id}`)) list[i] = x
    }
  }
  return out
}
