<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import RankTable from '../components/RankTable.vue'
import Seg from '../components/Seg.vue'
import { playerRanking, teamRanking } from '../engine/stats'
import { GAME_LABELS } from '../engine/types'
import type { GameKind } from '../engine/types'
import { useData } from '../stores/data'

const data = useData()
const kind = ref<GameKind | 'all'>('coinche')
const k = computed(() => (kind.value === 'all' ? null : kind.value))
const players = computed(() => playerRanking(data.stats, k.value))
const teams = computed(() => teamRanking(data.stats, k.value))
</script>

<template>
  <PageHeader title="Classements" back="/" backLabel="Accueil" />
  <Seg
    v-model="kind" label="Jeu"
    :options="[...(Object.keys(GAME_LABELS) as GameKind[]).map((g) => ({ value: g as GameKind | 'all', label: GAME_LABELS[g] })), { value: 'all' as const, label: 'Tous (mélangés)' }]"
  />
  <p v-if="kind === 'all'" class="note mt-3">Ce bilan mélange les jeux : il ne compare que participations, victoires et taux, jamais des scores bruts.</p>
  <p class="muted my-3">Seules les parties terminées comptent. Tri : victoires, puis taux de victoire ; les égalités sont conservées.</p>
  <section class="card mb-4" aria-labelledby="cj"><h2 id="cj" class="mb-2 text-xl font-bold">Joueurs</h2><RankTable :rows="players" caption="Classement des joueurs" link-base="/joueur" /></section>
  <section v-if="kind !== 'tarot'" class="card" aria-labelledby="ce"><h2 id="ce" class="mb-2 text-xl font-bold">Équipes</h2><RankTable :rows="teams" caption="Classement des équipes" link-base="/equipe" /></section>
</template>
