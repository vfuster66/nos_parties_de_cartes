<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { RoomView } from '../../../shared/coinche/views'
import { signed } from '../../labels'
import { contractText, nameOfSeat, teamName } from '../labels'

const props = defineProps<{ view: RoomView }>()
const r = computed(() => props.view.result!)
const abandoned = computed(() => props.view.status === 'abandoned')
</script>

<template>
  <div class="flex flex-col gap-3" data-testid="result">
    <section class="card text-center !border-gold !border-2">
      <h2 class="text-2xl font-bold">{{ abandoned ? 'Partie abandonnée' : 'Partie terminée' }}</h2>
      <p v-if="abandoned" class="muted">Aucune victoire n’est attribuée à une partie abandonnée.</p>
      <p v-else-if="r.winnerTeam != null" class="mt-1 text-xl font-semibold" data-testid="winner">
        🏆 {{ teamName(view, r.winnerTeam) }} ({{
          view.participants
            .filter((p) => p.seat != null && p.seat % 2 === r.winnerTeam)
            .map((p) => p.nickname)
            .join(' et ')
        }})
      </p>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <div v-for="t in [0, 1] as const" :key="t" class="rounded-lg bg-slate-100 p-2">
          <p class="font-semibold">{{ teamName(view, t) }}</p>
          <p class="text-3xl font-bold" :data-testid="`final-${t}`">{{ r.totals[t] }}</p>
        </div>
      </div>
    </section>
    <section class="card">
      <h3 class="mb-2 text-lg font-bold">Donnes jouées</h3>
      <ul class="flex flex-col gap-1">
        <li v-for="h in view.rounds" :key="h.index">
          Donne {{ h.index + 1 }} :
          <template v-if="h.passed">tout le monde a passé</template>
          <template v-else>
            {{ contractText(h.contract) }} ({{ nameOfSeat(view, h.contract!.seat) }}) — {{ signed(h.delta[0]) }} /
            {{ signed(h.delta[1]) }} → {{ h.totalsAfter[0] }} / {{ h.totalsAfter[1] }}
          </template>
        </li>
      </ul>
    </section>
    <p class="muted">
      Ce résultat est conservé sur cet appareil (rubrique « Jouer en ligne »). Il n’alimente pas vos statistiques
      locales tant que vous ne l’associez pas à un joueur.
    </p>
    <RouterLink to="/" class="btn btn-primary">Retour à l’accueil</RouterLink>
  </div>
</template>
