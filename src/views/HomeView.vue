<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import GameCard from '../components/GameCard.vue'
import { gameTitle } from '../engine/model'
import { useData } from '../stores/data'

const data = useData()
const resume = computed(() => data.lastActiveGame)
const recent = computed(() => [...data.games].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 3))
const links = [
  ['/soirees', '🌙 Soirées'], ['/historique', '📜 Historique'], ['/joueurs', '👤 Joueurs'], ['/equipes', '👥 Équipes'],
  ['/classements', '🏆 Classements'], ['/parametres', '⚙️ Paramètres'],
]
</script>

<template>
  <h1 class="mb-3 text-2xl font-bold">Nos parties de cartes</h1>
  <p class="muted mb-4">Compteur de points pour la coinche, la belote et le tarot.</p>
  <div class="flex flex-col gap-3">
    <RouterLink v-if="resume" :to="`/partie/${resume.id}`" class="btn btn-primary !min-h-16 text-xl">▶ Reprendre : {{ gameTitle(resume) }}</RouterLink>
    <RouterLink to="/nouvelle" class="btn !min-h-16 text-xl" :class="resume ? '' : 'btn-primary'">＋ Nouvelle partie</RouterLink>
    <div class="grid grid-cols-2 gap-3">
      <RouterLink v-for="l in links" :key="l[0]" :to="l[0]" class="btn !min-h-16">{{ l[1] }}</RouterLink>
    </div>
  </div>
  <section v-if="recent.length" class="mt-6" aria-labelledby="rec">
    <h2 id="rec" class="mb-2 text-xl font-bold">Parties récentes</h2>
    <div class="flex flex-col gap-2"><GameCard v-for="g in recent" :key="g.id" :game="g" /></div>
  </section>
  <p v-else class="card mt-6">Aucune partie pour l’instant. Commencez par « Nouvelle partie » : vous pourrez créer vos joueurs à ce moment-là.</p>
</template>
