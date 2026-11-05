<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import { computeGame, computeResult, entityPlayerIds } from '../engine/game'
import { gameTitle } from '../engine/model'
import { useData } from '../stores/data'

const props = defineProps<{ id: string }>()
const data = useData()
const game = computed(() => data.game(props.id))
const state = computed(() => (game.value ? computeGame(game.value) : null))
const result = computed(() => (game.value && state.value ? computeResult(game.value, state.value.totals) : null))
const label = (i: number) => {
  const g = game.value!
  return g.kind === 'tarot'
    ? data.playerName(g.playerIds[i])
    : `${data.gameTeamName(g, i as 0 | 1)} (${entityPlayerIds(g, i)
        .map((p) => data.playerName(p))
        .join(' & ')})`
}
</script>

<template>
  <template v-if="game && state && result">
    <PageHeader :title="`Résultat — ${gameTitle(game)}`" :back="`/partie/${id}`" back-label="Tableau des scores">
      <p class="muted">
        {{
          game.status === 'finished'
            ? 'Partie terminée'
            : game.status === 'abandoned'
              ? 'Partie abandonnée (hors classements)'
              : 'Partie en cours : résultat provisoire'
        }}
      </p>
    </PageHeader>
    <p v-if="result.draw" class="note mb-3">Égalité parfaite entre les deux équipes.</p>
    <p v-else class="ok mb-3 text-xl">
      🏆 {{ result.winners.length > 1 ? 'Gagnants ex æquo' : 'Gagnant' }} :
      <strong>{{ result.winners.map(label).join(' ; ') }}</strong>
    </p>
    <ol class="mb-4 flex flex-col gap-2" aria-label="Classement">
      <li v-for="r in result.ranking" :key="r.index" class="card flex items-center justify-between gap-2">
        <span
          ><strong
            >{{ r.rank }}{{ r.rank === 1 ? 'er' : 'e'
            }}{{ result.ranking.filter((x) => x.rank === r.rank).length > 1 ? ' ex æquo' : '' }}</strong
          >
          — {{ label(r.index) }}</span
        >
        <strong class="text-2xl tabular-nums">{{ r.score }}</strong>
      </li>
    </ol>
    <div class="flex flex-col gap-2">
      <RouterLink :to="{ path: '/nouvelle', query: { rematch: id } }" class="btn btn-primary !min-h-14"
        >🔁 Revanche (même soirée, mêmes règles)</RouterLink
      >
      <RouterLink v-if="game.eveningId" :to="`/soiree/${game.eveningId}`" class="btn">Retour à la soirée</RouterLink>
      <RouterLink to="/" class="btn">Accueil</RouterLink>
    </div>
  </template>
  <p v-else class="card">Partie introuvable.</p>
</template>
