<script setup lang="ts">
import { computed, ref } from 'vue'
import GameCard from '../components/GameCard.vue'
import PageHeader from '../components/PageHeader.vue'
import { GAME_LABELS } from '../engine/types'
import { useData } from '../stores/data'

const data = useData()
const kind = ref('')
const eveningId = ref('')
const playerId = ref('')
const teamId = ref('')
const status = ref('')
const list = computed(() =>
  [...data.games]
    .filter((g) => (!kind.value || g.kind === kind.value) && (!status.value || g.status === status.value))
    .filter((g) =>
      eveningId.value === '' ? true : eveningId.value === 'none' ? !g.eveningId : g.eveningId === eveningId.value,
    )
    .filter((g) => !playerId.value || g.playerIds.includes(playerId.value))
    .filter((g) => !teamId.value || g.teamIds?.includes(teamId.value))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
)
</script>

<template>
  <PageHeader title="Historique" back="/" back-label="Accueil" />
  <div class="card mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
    <div>
      <label class="label" for="f-kind">Jeu</label>
      <select id="f-kind" v-model="kind" class="input">
        <option value="">Tous</option>
        <option v-for="(l, k) in GAME_LABELS" :key="k" :value="k">{{ l }}</option>
      </select>
    </div>
    <div>
      <label class="label" for="f-st">État</label>
      <select id="f-st" v-model="status" class="input">
        <option value="">Tous</option>
        <option value="in_progress">En cours</option>
        <option value="finished">Terminée</option>
        <option value="abandoned">Abandonnée</option>
      </select>
    </div>
    <div>
      <label class="label" for="f-ev">Soirée</label>
      <select id="f-ev" v-model="eveningId" class="input">
        <option value="">Toutes</option>
        <option value="none">Parties indépendantes</option>
        <option v-for="e in data.evenings" :key="e.id" :value="e.id">{{ e.name || e.date }} ({{ e.date }})</option>
      </select>
    </div>
    <div>
      <label class="label" for="f-pl">Joueur</label>
      <select id="f-pl" v-model="playerId" class="input">
        <option value="">Tous</option>
        <option v-for="p in data.players" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </div>
    <div class="sm:col-span-2">
      <label class="label" for="f-te">Équipe</label>
      <select id="f-te" v-model="teamId" class="input">
        <option value="">Toutes</option>
        <option v-for="t in data.teams" :key="t.id" :value="t.id">{{ data.teamName(t.id) }}</option>
      </select>
    </div>
  </div>
  <p class="muted mb-2" role="status">{{ list.length }} partie{{ list.length > 1 ? 's' : '' }}</p>
  <div class="flex flex-col gap-2"><GameCard v-for="g in list" :key="g.id" :game="g" /></div>
</template>
