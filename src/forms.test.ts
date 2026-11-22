import { describe, expect, it } from 'vitest'
import { defaultRules } from './engine/types'
import type { Game } from './engine/model'
import { coincheFromForm, emptyForm, tarotFromForm } from './forms'
import type { CoincheForm, TarotForm } from './forms'

const game = (): Game => ({
  id: 'g',
  kind: 'coinche',
  autoName: 'x',
  eveningId: null,
  startedAt: '',
  endedAt: null,
  status: 'in_progress',
  playerIds: ['a', 'b', 'c', 'd'],
  teamIds: ['t1', 't2'],
  firstDealerId: 'a',
  rules: defaultRules('coinche'),
  deals: [],
})

describe('formulaires de donne', () => {
  it('n’a aucun contrat déjà choisi', () => {
    const coinche = emptyForm('coinche') as CoincheForm
    const tarot = emptyForm('tarot') as TarotForm
    expect(coinche.contract).toBe('')
    expect(tarot.contract).toBe('')
    expect(tarot.success).toBe('')
  })

  it('refuse une coinche sans contrat, preneur ni atout', () => {
    const parsed = coincheFromForm(game(), emptyForm('coinche') as CoincheForm)
    expect(parsed.input).toBeUndefined()
    expect(parsed.errors.join(' ')).toContain('Choisissez le contrat')
  })

  it('convertit une coinche complète', () => {
    const form = emptyForm('coinche') as CoincheForm
    form.takerId = 'a'
    form.trump = 'coeur'
    form.contract = '100'
    form.points = '90'
    const parsed = coincheFromForm(game(), form)
    expect(parsed.errors).toEqual([])
    expect(parsed.input).toMatchObject({ contract: 100, takerPoints: 90, trump: 'coeur', takerTeam: 0 })
  })

  it('refuse un tarot sans contrat ni résultat', () => {
    const form = emptyForm('tarot') as TarotForm
    form.takerId = 'a'
    form.gap = '4'
    const parsed = tarotFromForm(form, 4)
    expect(parsed.input).toBeUndefined()
    expect(parsed.errors).toContain('Choisissez le contrat.')
    expect(parsed.errors).toContain('Indiquez si le contrat est réussi ou chuté.')
  })
})
