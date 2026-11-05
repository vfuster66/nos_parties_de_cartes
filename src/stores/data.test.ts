import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/backup'
import { defaultRules } from '../engine/types'
import type { CoincheInput } from '../engine/coinche'
import { participations } from '../engine/stats'
import { useData } from './data'

const input = (takerId: string): CoincheInput => ({
  takerId, takerTeam: 0, contract: 80, trump: 'pique', level: 'none', takerPoints: 100, allTricks: false, beloteTeam: null,
})

async function setup() {
  setActivePinia(createPinia())
  const d = useData()
  await d.clearAll()
  const [a, b, c, e] = await Promise.all(['Anna', 'Bob', 'Cléo', 'Eli'].map((n) => d.addPlayer(n)))
  return { d, a, b, c, e }
}

describe('store et persistance', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
  })

  it('reconnaît une équipe quel que soit l’ordre des membres ; renommer conserve l’historique', async () => {
    const { d, a, c } = await setup()
    const t1 = await d.ensureTeam(a.id, c.id)
    const t2 = await d.ensureTeam(c.id, a.id, 'Les As')
    expect(t2.id).toBe(t1.id)
    expect(d.teams).toHaveLength(1)
    expect(d.teamName(t1.id)).toBe('Les As')
    await d.renamePlayer(a.id, 'Anaïs')
    expect(d.playerName(a.id)).toBe('Anaïs')
  })

  it('signale les homonymes sans les empêcher', async () => {
    const { d } = await setup()
    expect(d.similarPlayers('  anna ')).toHaveLength(1)
    await d.addPlayer('Anna')
    expect(d.players.filter((p) => p.name === 'Anna')).toHaveLength(2)
  })

  it('parcours : partie, donne, reprise après rechargement, brouillon, annulation, export/import', async () => {
    const { d, a, b, c, e } = await setup()
    const g = await d.createGame({
      kind: 'coinche', eveningId: null, teamA: [a.id, c.id], teamB: [b.id, e.id], teamNames: ['', ''],
      firstDealerId: a.id, rules: defaultRules('coinche'),
    })
    expect(g.playerIds).toEqual([a.id, b.id, c.id, e.id])
    expect(g.autoName).toBe('Coinche — Partie 1')
    await d.saveDeal(g.id, { id: 'd1', dealerId: a.id, passed: false, input: input(a.id), createdAt: '' })
    await d.saveDraft(g.id, null, { form: { x: 1 }, dealerId: b.id })
    expect(d.state(g.id)!.totals).toEqual([180, 60])
    await d.setStatus(g.id, 'finished')
    expect(participations(d.game(g.id)!)).toHaveLength(2)

    // « rechargement » : nouveau store, mêmes données depuis IndexedDB
    setActivePinia(createPinia())
    const d2 = useData()
    await d2.load()
    expect(d2.games).toHaveLength(1)
    expect(d2.games[0].deals).toHaveLength(1)
    expect(d2.getDraft(g.id, null)).toBeTruthy()

    // annulation
    await d2.deleteDeal(g.id, 'd1')
    expect(d2.game(g.id)!.deals).toHaveLength(0)
    await d2.undo(g.id)
    expect(d2.game(g.id)!.deals).toHaveLength(1)

    // export → import : identique, aucun doublon
    const json = d2.exportJson()
    const r = migrate(JSON.parse(json))
    expect(r.errors).toEqual([])
    const plan = d2.planImport(r.file!.data)
    expect(plan.conflicts).toHaveLength(0)
    expect(plan.add.games).toHaveLength(0)
    await d2.importMerge(r.file!.data, new Set())
    expect(d2.games).toHaveLength(1)
    expect(d2.players).toHaveLength(4)
  })

  it('conflit d’import : jamais d’écrasement silencieux', async () => {
    const { d, a } = await setup()
    const file = migrate(JSON.parse(d.exportJson())).file!
    file.data.players.find((p) => p.id === a.id)!.name = 'Autre nom'
    const plan = d.planImport(file.data)
    expect(plan.conflicts).toHaveLength(1)
    await d.importMerge(file.data, new Set()) // garder l'existant
    expect(d.playerName(a.id)).toBe('Anna')
    await d.importMerge(file.data, new Set([`players:${a.id}`]))
    expect(d.playerName(a.id)).toBe('Autre nom')
  })

  it('rejette les sauvegardes incohérentes', () => {
    expect(migrate({ app: 'autre' }).errors.length).toBeGreaterThan(0)
    expect(migrate({ app: 'nos-parties-de-cartes', schemaVersion: 99, data: {} }).errors[0]).toMatch(/plus récente/)
    const bad = { app: 'nos-parties-de-cartes', schemaVersion: 1, data: { players: [], teams: [], evenings: [], games: [{ id: 'g', kind: 'coinche', status: 'finished', playerIds: ['x', 'x', 'y', 'z'], deals: [] }] } }
    expect(migrate(bad).errors.length).toBeGreaterThan(0)
  })

  it('refuse de supprimer un joueur ayant des parties', async () => {
    const { d, a, b, c, e } = await setup()
    await d.createGame({ kind: 'belote', eveningId: null, teamA: [a.id, c.id], teamB: [b.id, e.id], firstDealerId: a.id, rules: defaultRules('belote') })
    await expect(d.deletePlayer(a.id)).rejects.toThrow()
  })
})
