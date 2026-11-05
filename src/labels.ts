import type { DealRow } from './engine/game'

export const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')

export function outcomeLabel(row: DealRow): string {
  if (row.error) return '⚠ Erreur'
  if (row.deal.passed) return '⏭ Passée'
  const o = row.teamDetail?.outcome ?? row.tarotDetail?.outcome
  return o === 'success' ? '✓ Réussie' : o === 'fail' ? '✗ Chute' : o === 'litige' ? '⚖ Litige' : o === 'capot' ? '★ Capot' : ''
}
export const frDate = (iso: string): string => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
