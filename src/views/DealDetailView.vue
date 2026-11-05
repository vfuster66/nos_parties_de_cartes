<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import DealBreakdown from '../components/DealBreakdown.vue'
import PageHeader from '../components/PageHeader.vue'
import { computeGame } from '../engine/game'
import { describeDeal } from '../engine/describe'
import { useData } from '../stores/data'

const props = defineProps<{ id: string; dealId: string }>()
const data = useData()
const game = computed(() => data.game(props.id))
const row = computed(() => (game.value ? computeGame(game.value).rows.find((r) => r.deal.id === props.dealId) : undefined))
</script>

<template>
  <template v-if="game && row">
    <PageHeader :title="`Donne ${row.index + 1} — détail du calcul`" :back="`/partie/${id}`" back-label="Tableau des scores" />
    <p class="mb-3">{{ describeDeal(game, row.deal, { player: data.playerName, team: (i) => data.gameTeamName(game!, i) }) }}</p>
    <p class="muted mb-3">Donneur : {{ data.playerName(row.deal.dealerId) }}</p>
    <p v-if="row.error" class="err">{{ row.error }}</p>
    <DealBreakdown v-else class="card" :game="game" :row="row" />
    <RouterLink :to="`/partie/${id}/donne/${dealId}`" class="btn mt-3 w-full">Modifier cette donne</RouterLink>
  </template>
  <p v-else class="card">Donne introuvable.</p>
</template>
