<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import ConfirmHost from './components/ConfirmHost.vue'
import UpdatePrompt from './components/UpdatePrompt.vue'
import { useData } from './stores/data'

const data = useData()
const route = useRoute()
// L'écran de jeu en ligne occupe tout l'espace : pas de barre de navigation par-dessus la main.
const inRoom = computed(() => route.path.startsWith('/en-ligne/salon/'))
</script>

<template>
  <div class="mx-auto flex min-h-dvh max-w-2xl flex-col">
    <main class="flex-1 px-3 pt-3" :class="inRoom ? 'pb-6' : 'pb-24'">
      <p v-if="!data.ready" class="muted" role="status">Chargement des données…</p>
      <div v-else-if="data.loadError" class="err" role="alert">
        Impossible de lire les données enregistrées : {{ data.loadError }}
        L’application fonctionne mais rien ne sera conservé tant que ce problème persiste.
      </div>
      <template v-if="data.ready">
        <div v-if="data.saveError" class="err mb-3" role="alert">
          {{ data.saveError }}
          <button class="btn mt-2 w-full" @click="data.saveError = null">Fermer ce message</button>
        </div>
        <RouterView />
      </template>
    </main>
    <nav
      v-if="!inRoom"
      class="fixed inset-x-0 bottom-0 z-10 border-t border-stone-300 bg-white pb-[env(safe-area-inset-bottom)]"
      aria-label="Navigation principale"
    >
      <ul class="mx-auto flex max-w-2xl">
        <li
          v-for="l in [
            ['/', 'Accueil', '🏠'],
            ['/en-ligne', 'En ligne', '🌐'],
            ['/classements', 'Classements', '🏆'],
            ['/parametres', 'Réglages', '⚙️'],
          ]"
          :key="l[0]"
          class="flex-1"
        >
          <RouterLink
            :to="l[0]"
            class="flex min-h-14 flex-col items-center justify-center border-t-4 border-transparent text-sm font-semibold text-slate-700"
            exact-active-class="!border-gold bg-teal-50 text-teal-900"
          >
            <span aria-hidden="true">{{ l[2] }}</span
            >{{ l[1] }}
          </RouterLink>
        </li>
      </ul>
    </nav>
    <ConfirmHost />
    <UpdatePrompt />
  </div>
</template>
