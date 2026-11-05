<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import { useData } from '../stores/data'

const data = useData()
</script>

<template>
  <PageHeader title="Équipes" back="/" back-label="Accueil" />
  <p class="muted mb-3">
    Une équipe est créée automatiquement lors du choix de ses deux membres, dans n’importe quel ordre.
  </p>
  <p v-if="!data.teams.length" class="card muted">Aucune équipe.</p>
  <ul class="flex flex-col gap-2">
    <li v-for="t in data.teams" :key="t.id">
      <RouterLink :to="`/equipe/${t.id}`" class="card block"
        ><strong>{{ data.teamName(t.id) }}</strong>
        <p v-if="t.name" class="muted">
          {{ data.playerName(t.memberIds[0]) }} & {{ data.playerName(t.memberIds[1]) }}
        </p></RouterLink
      >
    </li>
  </ul>
</template>
