<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { computed } from 'vue'
import type { Participation } from '../engine/stats'
import { tallyOf, winRate } from '../engine/stats'
import { GAME_LABELS } from '../engine/types'
import type { GameKind } from '../engine/types'
import { useData } from '../stores/data'
import { gameTitle } from '../engine/model'

const props = defineProps<{ parts: Participation[] }>()
const data = useData()
const kinds = computed(() =>
  (Object.keys(GAME_LABELS) as GameKind[]).filter((k) => props.parts.some((p) => p.kind === k)),
)
const rows = computed(() => kinds.value.map((k) => ({ k, t: tallyOf(props.parts.filter((p) => p.kind === k)) })))
const total = computed(() => tallyOf(props.parts))
const pct = (x: number) => `${Math.round(x * 100)} %`
const resultLabel = { win: '✓ Victoire', loss: '✗ Défaite', draw: '＝ Égalité' }
</script>

<template>
  <p v-if="!parts.length" class="card muted">Aucune partie terminée.</p>
  <template v-else>
    <div class="overflow-x-auto">
      <table class="w-full text-left text-base">
        <caption class="sr-only">
          Statistiques par jeu (parties terminées)
        </caption>
        <thead>
          <tr class="border-b-2 border-slate-300">
            <th scope="col" class="py-1">Jeu</th>
            <th scope="col">Parties</th>
            <th scope="col">Vict.</th>
            <th scope="col">Déf.</th>
            <th scope="col">Nulles</th>
            <th scope="col">Taux</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.k" class="border-b border-slate-200">
            <th scope="row" class="py-1">{{ GAME_LABELS[r.k] }}</th>
            <td>{{ r.t.played }}</td>
            <td>{{ r.t.wins }}</td>
            <td>{{ r.t.losses }}</td>
            <td>{{ r.t.draws }}</td>
            <td>{{ pct(winRate(r.t)) }}</td>
          </tr>
          <tr v-if="rows.length > 1">
            <th scope="row" class="py-1">Tous (mélangés)</th>
            <td>{{ total.played }}</td>
            <td>{{ total.wins }}</td>
            <td>{{ total.losses }}</td>
            <td>{{ total.draws }}</td>
            <td>{{ pct(winRate(total)) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <h3 class="mt-4 font-bold">Prises</h3>
    <ul class="list-disc pl-5">
      <li v-for="r in rows" :key="r.k">
        {{ GAME_LABELS[r.k] }} : {{ r.t.takes }} prise{{ r.t.takes > 1 ? 's' : '' }} — {{ r.t.takeSuccess }} réussie{{
          r.t.takeSuccess > 1 ? 's' : ''
        }}, {{ r.t.takeFail }} chutée{{ r.t.takeFail > 1 ? 's' : ''
        }}<template v-if="r.k === 'belote'">, {{ r.t.takeLitige }} litige{{ r.t.takeLitige > 1 ? 's' : '' }}</template>
      </li>
    </ul>
    <h3 class="mt-4 font-bold">Historique des scores</h3>
    <ul class="flex flex-col gap-1">
      <li v-for="p in [...parts].reverse()" :key="p.gameId + p.score">
        <RouterLink :to="`/partie/${p.gameId}/resultat`" class="underline">{{
          data.game(p.gameId) ? gameTitle(data.game(p.gameId)!) : 'Partie'
        }}</RouterLink>
        — {{ p.score }} pts · {{ resultLabel[p.result] }}
      </li>
    </ul>
  </template>
</template>
