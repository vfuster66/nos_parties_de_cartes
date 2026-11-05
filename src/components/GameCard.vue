<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { computeGame, entityPlayerIds } from '../engine/game'
import type { Game } from '../engine/model'
import { gameTitle } from '../engine/model'
import { useData } from '../stores/data'

const props = defineProps<{ game: Game }>()
const data = useData()
const state = computed(() => computeGame(props.game))
const status = { in_progress: 'En cours', finished: 'Terminée', abandoned: 'Abandonnée' }
const entities = computed(() =>
  state.value.totals.map((t, i) => ({
    label:
      props.game.kind === 'tarot'
        ? data.playerName(props.game.playerIds[i])
        : entityPlayerIds(props.game, i)
            .map((p) => data.playerName(p))
            .join(' & '),
    total: t,
  })),
)
const date = computed(() => new Date(props.game.startedAt).toLocaleDateString('fr-FR'))
const to = computed(() =>
  props.game.status === 'finished' ? `/partie/${props.game.id}/resultat` : `/partie/${props.game.id}`,
)
</script>

<template>
  <RouterLink :to="to" class="card block active:bg-slate-100">
    <div class="flex items-baseline justify-between gap-2">
      <strong class="truncate">{{ gameTitle(game) }}</strong>
      <span class="shrink-0 rounded-full border-2 border-slate-400 px-2 text-sm font-semibold">{{
        status[game.status]
      }}</span>
    </div>
    <p class="muted">{{ date }} · {{ state.rows.length }} donne{{ state.rows.length > 1 ? 's' : '' }}</p>
    <p class="mt-1 text-base">
      <span v-for="(e, i) in entities" :key="i"
        >{{ i ? ' · ' : '' }}{{ e.label }} <strong>{{ e.total }}</strong></span
      >
    </p>
  </RouterLink>
</template>
