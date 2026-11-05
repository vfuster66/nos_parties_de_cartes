<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue'

// Mise à jour sur demande : jamais de rechargement automatique pendant une saisie.
// (Les brouillons sont de toute façon enregistrés dans IndexedDB.)
const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({ immediate: true })
</script>

<template>
  <div v-if="needRefresh || offlineReady" class="fixed inset-x-0 bottom-16 z-40 mx-auto max-w-2xl px-3" role="status">
    <div class="card flex flex-col gap-2 border-2 border-teal-700">
      <template v-if="needRefresh">
        <p class="font-semibold">Une nouvelle version est disponible.</p>
        <p class="muted">Vos données et brouillons sont conservés. Rechargez quand vous n’êtes pas en pleine saisie.</p>
        <div class="flex gap-2">
          <button class="btn btn-primary flex-1" @click="updateServiceWorker(true)">Recharger maintenant</button>
          <button class="btn flex-1" @click="needRefresh = false">Plus tard</button>
        </div>
      </template>
      <template v-else>
        <p class="font-semibold">L’application est prête à fonctionner hors connexion.</p>
        <button class="btn" @click="offlineReady = false">Fermer</button>
      </template>
    </div>
  </div>
</template>
