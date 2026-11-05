<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import ConfirmHost from './components/ConfirmHost.vue'
import { useData } from './stores/data'

const data = useData()
</script>

<template>
  <div class="mx-auto flex min-h-dvh max-w-2xl flex-col">
    <main class="flex-1 px-3 pb-24 pt-3">
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
    <nav class="fixed inset-x-0 bottom-0 z-10 border-t-2 border-slate-300 bg-white" aria-label="Navigation principale">
      <ul class="mx-auto flex max-w-2xl">
        <li v-for="l in [['/', 'Accueil', '🏠'], ['/soirees', 'Soirées', '🌙'], ['/classements', 'Classements', '🏆'], ['/parametres', 'Réglages', '⚙️']]" :key="l[0]" class="flex-1">
          <RouterLink :to="l[0]" class="flex min-h-14 flex-col items-center justify-center text-sm font-semibold" active-class="bg-teal-50 text-teal-900 underline" exact-active-class="bg-teal-50 text-teal-900 underline">
            <span aria-hidden="true">{{ l[2] }}</span>{{ l[1] }}
          </RouterLink>
        </li>
      </ul>
    </nav>
    <ConfirmHost />
  </div>
</template>
