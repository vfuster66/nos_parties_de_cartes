<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import GameCard from '../components/GameCard.vue'
import { gameTitle } from '../engine/model'
import { onlineEnabled } from '../online/config'
import { loadSessions } from '../online/local'
import { formatCode } from '../../shared/protocol'
import { useData } from '../stores/data'

const data = useData()
const resume = computed(() => data.lastActiveGame)
const recent = computed(() =>
  [...data.games]
    .filter((g) => g.id !== resume.value?.id)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 3),
)
// Dernier salon en ligne dont cet appareil garde la place (24 h au plus : au-delà il est presque sûrement terminé).
const lastRoom = computed(
  () =>
    Object.values(loadSessions())
      .filter((s) => Date.now() - s.savedAt < 24 * 3600 * 1000)
      .sort((a, b) => b.savedAt - a.savedAt)[0],
)
const links = [
  ['/soirees', '🌙', 'Soirées'],
  ['/historique', '📜', 'Historique'],
  ['/joueurs', '👤', 'Joueurs'],
  ['/equipes', '👥', 'Équipes'],
]
</script>

<template>
  <h1 class="mb-3 flex items-center gap-2 text-2xl font-bold">
    <span class="text-suit-red" aria-hidden="true">♥</span>Nos parties de cartes<span aria-hidden="true">♠</span>
  </h1>

  <section
    aria-labelledby="count-title"
    class="mb-4 rounded-3xl bg-[radial-gradient(ellipse_at_top,#2a7a53,#174a32)] p-4 text-white shadow-md"
  >
    <h2 id="count-title" class="text-2xl font-bold">✏️ Compter une partie</h2>
    <div class="mb-3 mt-1 flex flex-wrap gap-1.5" aria-label="Jeux disponibles hors connexion">
      <span class="badge bg-white/15 text-white">Coinche</span>
      <span class="badge bg-white/15 text-white">Belote</span>
      <span class="badge bg-white/15 text-white">Tarot</span>
      <span class="badge bg-white/15 text-white">Hors connexion</span>
    </div>
    <div class="flex flex-col gap-2.5">
      <RouterLink
        v-if="resume"
        :to="`/partie/${resume.id}`"
        class="btn btn-gold !min-h-16 !flex-col !items-start !gap-0 text-lg"
        data-testid="resume-game"
      >
        <span>▶ Reprendre la partie</span>
        <span class="text-sm font-semibold">{{ gameTitle(resume) }}</span>
      </RouterLink>
      <RouterLink
        to="/nouvelle"
        class="btn !min-h-14 text-lg"
        :class="resume ? '!border-white/40 !bg-white/10 !text-white' : 'btn-gold'"
        >＋ Nouvelle partie</RouterLink
      >
    </div>
  </section>

  <section
    v-if="onlineEnabled"
    aria-labelledby="online-title"
    class="mb-4 rounded-3xl border-2 border-gold bg-gold-soft/50 p-4 shadow-sm"
  >
    <h2 id="online-title" class="text-2xl font-bold">🌐 Jouer en ligne</h2>
    <div class="mb-3 mt-1 flex flex-wrap gap-1.5" aria-label="Jeu en ligne">
      <span class="badge">Salon privé</span>
      <span class="badge">3–6 joueurs</span>
      <span class="badge">Connexion requise</span>
    </div>
    <div class="flex flex-col gap-2.5">
      <RouterLink
        v-if="lastRoom"
        :to="`/en-ligne/salon/${lastRoom.roomId}`"
        class="btn btn-primary !min-h-16 !flex-col !items-start !gap-0 text-lg"
        data-testid="resume-room"
      >
        <span>▶ Retrouver ma place</span>
        <span class="text-sm font-semibold">Salon {{ formatCode(lastRoom.code) }} · {{ lastRoom.nickname }}</span>
      </RouterLink>
      <RouterLink
        to="/en-ligne"
        class="btn !min-h-14 text-lg"
        :class="lastRoom ? '' : 'btn-primary'"
        data-testid="play-online"
      >
        Créer ou rejoindre un salon
      </RouterLink>
    </div>
  </section>

  <nav aria-label="Raccourcis" class="mb-5 grid grid-cols-4 gap-2">
    <RouterLink v-for="l in links" :key="l[0]" :to="l[0]" class="btn !min-h-16 flex-col !gap-0 !px-1 text-sm">
      <span class="text-xl" aria-hidden="true">{{ l[1] }}</span
      >{{ l[2] }}
    </RouterLink>
  </nav>

  <section v-if="recent.length" aria-labelledby="rec">
    <h2 id="rec" class="mb-2 text-xl font-bold">Parties récentes</h2>
    <div class="flex flex-col gap-2"><GameCard v-for="g in recent" :key="g.id" :game="g" /></div>
  </section>
  <p v-else-if="!resume" class="card muted">Aucune partie.</p>
</template>
