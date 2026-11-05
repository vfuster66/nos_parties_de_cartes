<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import GameCard from '../components/GameCard.vue'
import { gameTitle } from '../engine/model'
import { onlineEnabled } from '../online/config'
import { useData } from '../stores/data'

const data = useData()
const resume = computed(() => data.lastActiveGame)
const recent = computed(() => [...data.games].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 3))
const links = [
  ['/soirees', '🌙 Soirées'],
  ['/historique', '📜 Historique'],
  ['/joueurs', '👤 Joueurs'],
  ['/equipes', '👥 Équipes'],
  ['/classements', '🏆 Classements'],
  ['/parametres', '⚙️ Paramètres'],
]
</script>

<template>
  <h1 class="mb-3 text-2xl font-bold">Nos parties de cartes</h1>
  <section aria-labelledby="count-title" class="mb-6">
    <h2 id="count-title" class="mb-1 text-xl font-bold">Compter une partie</h2>
    <p class="muted mb-3">
      Vous jouez avec de vraies cartes : saisissez les donnes (coinche, belote, tarot). Fonctionne hors connexion.
    </p>
    <div class="flex flex-col gap-3">
      <RouterLink v-if="resume" :to="`/partie/${resume.id}`" class="btn btn-primary !min-h-16 text-xl"
        >▶ Reprendre : {{ gameTitle(resume) }}</RouterLink
      >
      <RouterLink to="/nouvelle" class="btn !min-h-16 text-xl" :class="resume ? '' : 'btn-primary'"
        >＋ Nouvelle partie</RouterLink
      >
      <div class="grid grid-cols-2 gap-3">
        <RouterLink v-for="l in links" :key="l[0]" :to="l[0]" class="btn !min-h-16">{{ l[1] }}</RouterLink>
      </div>
    </div>
  </section>
  <section v-if="onlineEnabled" aria-labelledby="online-title" class="mb-6">
    <h2 id="online-title" class="mb-1 text-xl font-bold">Jouer en ligne</h2>
    <p class="muted mb-3">Coinche à quatre, chacun sur son téléphone, dans un salon privé. Nécessite une connexion.</p>
    <RouterLink to="/en-ligne" class="btn btn-primary !min-h-16 text-xl" data-testid="play-online"
      >🌐 Jouer en ligne</RouterLink
    >
  </section>
  <section v-if="recent.length" class="mt-6" aria-labelledby="rec">
    <h2 id="rec" class="mb-2 text-xl font-bold">Parties récentes</h2>
    <div class="flex flex-col gap-2"><GameCard v-for="g in recent" :key="g.id" :game="g" /></div>
  </section>
  <p v-else class="card mt-6">
    Aucune partie pour l’instant. Commencez par « Nouvelle partie » : vous pourrez créer vos joueurs à ce moment-là.
  </p>
</template>
