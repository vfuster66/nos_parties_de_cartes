<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import RankTable from '../components/RankTable.vue'
import SegmentedChoice from '../components/SegmentedChoice.vue'
import { computeGame } from '../engine/game'
import { gameTitle } from '../engine/model'
import { playerRanking, teamRanking } from '../engine/stats'
import { GAME_LABELS } from '../engine/types'
import type { GameKind } from '../engine/types'
import { signed } from '../labels'
import { useData } from '../stores/data'

const data = useData()
const kind = ref<GameKind | 'all'>('coinche')
const k = computed(() => (kind.value === 'all' ? null : kind.value))
const players = computed(() => playerRanking(data.stats, k.value))
const teams = computed(() => teamRanking(data.stats, k.value))
const live = computed(() =>
  data.games
    .filter((g) => g.status === 'in_progress' && g.deals.length > 0 && (kind.value === 'all' || g.kind === kind.value))
    .map((g) => ({ game: g, totals: computeGame(g).totals }))
    .sort((a, b) => b.game.startedAt.localeCompare(a.game.startedAt)),
)
const liveLabel = (g: (typeof live.value)[number]['game'], i: number) =>
  g.kind === 'tarot' ? data.playerName(g.playerIds[i]) : data.gameTeamName(g, i as 0 | 1)
</script>

<template>
  <PageHeader title="Classements" back="/" back-label="Accueil" />
  <SegmentedChoice
    v-model="kind"
    label="Jeu"
    :options="[
      ...(Object.keys(GAME_LABELS) as GameKind[]).map((g) => ({ value: g as GameKind | 'all', label: GAME_LABELS[g] })),
      { value: 'all' as const, label: 'Tous (mélangés)' },
    ]"
  />
  <p v-if="kind === 'all'" class="note mt-3">Jeux mélangés · participations et victoires comparées, pas les scores.</p>
  <p class="muted my-3">Parties terminées · victoires puis taux · égalités conservées.</p>
  <section v-if="live.length" class="mb-4 flex flex-col gap-2" aria-labelledby="live-h">
    <h2 id="live-h" class="text-xl font-bold">En cours</h2>
    <RouterLink v-for="row in live" :key="row.game.id" :to="`/partie/${row.game.id}`" class="card">
      <p class="font-bold">{{ gameTitle(row.game) }}</p>
      <p>
        <span v-for="(total, i) in row.totals" :key="i"
          >{{ i ? ' · ' : '' }}{{ liveLabel(row.game, i) }} <strong>{{ signed(total) }}</strong></span
        >
      </p>
    </RouterLink>
  </section>
  <section class="card mb-4" aria-labelledby="cj">
    <h2 id="cj" class="mb-2 text-xl font-bold">Joueurs</h2>
    <RankTable :rows="players" caption="Classement des joueurs" link-base="/joueur" />
  </section>
  <section v-if="kind !== 'tarot'" class="card" aria-labelledby="ce">
    <h2 id="ce" class="mb-2 text-xl font-bold">Équipes</h2>
    <RankTable :rows="teams" caption="Classement des équipes" link-base="/equipe" />
  </section>
</template>
