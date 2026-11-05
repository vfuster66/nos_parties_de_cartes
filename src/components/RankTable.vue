<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { RankRow } from '../engine/stats'

defineProps<{ rows: RankRow[]; caption: string; linkBase: string }>()
const pct = (r: number) => `${Math.round(r * 100)} %`
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-left text-base">
      <caption class="sr-only">
        {{
          caption
        }}
      </caption>
      <thead>
        <tr class="border-b-2 border-slate-300">
          <th scope="col" class="py-1">Rang</th>
          <th scope="col">Nom</th>
          <th scope="col">Victoires</th>
          <th scope="col">Taux</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" class="border-b border-slate-200">
          <td class="py-2">{{ r.rank }}</td>
          <th scope="row">
            <RouterLink :to="`${linkBase}/${r.id}`" class="underline">{{ r.name }}</RouterLink>
          </th>
          <td>
            {{ r.tally.wins
            }}<span v-if="r.tally.draws" class="muted">
              (+{{ r.tally.draws }} nulle{{ r.tally.draws > 1 ? 's' : '' }})</span
            >
          </td>
          <td>
            {{ pct(r.rate) }}
            <span class="muted">sur {{ r.tally.played }} partie{{ r.tally.played > 1 ? 's' : '' }}</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!rows.length" class="muted py-2">Aucune partie terminée pour l’instant.</p>
  </div>
</template>
