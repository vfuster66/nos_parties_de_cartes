<script setup lang="ts">
import { computed } from 'vue'
import type { DealRow } from '../engine/game'
import type { Game } from '../engine/model'
import { TAROT_BONUS_LABELS, TAROT_CONTRACT_LABELS, sum } from '../engine/types'
import { signed } from '../labels'
import { useData } from '../stores/data'

const props = defineProps<{ game: Game; row: DealRow }>()
const data = useData()
const t = computed(() => props.row.teamDetail)
const ta = computed(() => props.row.tarotDetail)
const outcome = { success: 'Réussite', fail: 'Chute', litige: 'Litige', capot: 'Capot' }
const teamTitle = (i: number) => data.gameTeamName(props.game, i as 0 | 1)
const isBelote = computed(() => props.game.kind === 'belote')
</script>

<template>
  <div class="flex flex-col gap-3">
    <template v-if="t">
      <p class="text-lg"><strong>Issue : {{ outcome[t.outcome] }}</strong>
        <span v-if="game.kind === 'coinche' && t.multiplier > 1"> · multiplicateur ×{{ t.multiplier }}</span></p>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-base">
          <caption class="sr-only">Détail par équipe</caption>
          <thead><tr class="border-b-2 border-slate-300"><th scope="col" class="py-1">Équipe</th><th scope="col">Plis exacts</th><th scope="col">Plis retenus</th><th v-if="isBelote" scope="col">Annonces</th><th scope="col">Belote</th><th scope="col">Score</th></tr></thead>
          <tbody>
            <tr v-for="(x, i) in t.teams" :key="i" class="border-b border-slate-200">
              <th scope="row" class="py-1 pr-2">{{ teamTitle(i) }}</th>
              <td>{{ t.outcome === 'capot' && game.kind === 'belote' ? '—' : x.exactPlis }}</td><td>{{ x.retainedPlis }}</td>
              <td v-if="isBelote">{{ x.annonces }}</td><td>{{ x.belote }}</td>
              <td><strong>{{ x.score }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <template v-if="ta">
      <p class="text-lg"><strong>Issue : {{ ta.outcome === 'success' ? 'Réussite' : 'Chute' }}</strong> · {{ TAROT_CONTRACT_LABELS[(row.deal.input as any).contract as keyof typeof TAROT_CONTRACT_LABELS] }}</p>
      <ul class="list-disc pl-5">
        <li>Écart exact : {{ ta.gap }} → arrondi : {{ ta.roundedGap }}</li>
        <li>Base du contrat : {{ ta.base }}</li>
        <li>Valeur V = {{ signed(ta.value) }}</li>
      </ul>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-base">
          <caption class="sr-only">Détail par joueur</caption>
          <thead><tr class="border-b-2 border-slate-300"><th scope="col" class="py-1">Joueur</th><th scope="col">Contrat</th><th scope="col">Primes</th><th scope="col">Total</th></tr></thead>
          <tbody>
            <tr v-for="(p, i) in game.playerIds" :key="p" class="border-b border-slate-200">
              <th scope="row" class="py-1 pr-2">{{ data.playerName(p) }}<span v-if="game.playerIds.length === 6 && p === row.deal.dealerId" class="muted"> (repos)</span></th>
              <td>{{ signed(ta.contractDelta[i]) }}</td><td>{{ signed(sum(ta.bonuses.map((b) => b.delta[i]))) }}</td><td><strong>{{ signed(ta.delta[i]) }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="ta.bonuses.length">
        <h3 class="font-bold">Primes</h3>
        <ul class="list-disc pl-5">
          <li v-for="(b, i) in ta.bonuses" :key="i">{{ TAROT_BONUS_LABELS[b.type] }} — {{ data.playerName(b.playerId) }} : {{ b.succeeded ? 'réussie' : 'ratée' }}, {{ b.amountPerPlayer }} par joueur</li>
        </ul>
      </div>
    </template>

    <div v-if="row.reserveCreated || row.reserveAwarded.length" class="note">
      <p v-if="row.reserveCreated">⚖ Réserve créée : {{ row.reserveCreated.plis }} plis + {{ row.reserveCreated.annonces }} annonces + {{ row.reserveCreated.belote }} belote = <strong>{{ row.reserveCreated.total }}</strong>.</p>
      <template v-if="row.reserveAwarded.length">
        <p>⚖ Réserve attribuée à {{ teamTitle(row.reserveWinner ?? 0) }} : <strong>{{ sum(row.reserveAwarded.map((r) => r.total)) }}</strong></p>
        <ul class="list-disc pl-5"><li v-for="r in row.reserveAwarded" :key="r.dealId">{{ r.plis }} plis + {{ r.annonces }} annonces + {{ r.belote }} belote = {{ r.total }}</li></ul>
      </template>
    </div>

    <div>
      <h3 class="font-bold">Variation de la donne</h3>
      <p v-if="game.kind !== 'tarot'">
        <span v-for="(d, i) in row.delta" :key="i">{{ i ? ' · ' : '' }}{{ teamTitle(i) }} <strong>{{ signed(d) }}</strong></span>
      </p>
      <p v-else>Somme des variations : {{ sum(row.delta) }}</p>
    </div>

    <details open>
      <summary class="cursor-pointer font-bold">Étapes du calcul</summary>
      <ol class="mt-1 list-decimal pl-5"><li v-for="(s, i) in (t?.steps ?? ta?.steps ?? [])" :key="i">{{ s }}</li></ol>
    </details>
  </div>
</template>
