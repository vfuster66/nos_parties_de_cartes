<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { forgetSession } from '../online/local'
import OnlineLobby from '../online/components/OnlineLobby.vue'
import OnlineResult from '../online/components/OnlineResult.vue'
import OnlineTable from '../online/components/OnlineTable.vue'
import TarotTable from '../online/components/TarotTable.vue'
import { useOnline } from '../online/store'

const props = defineProps<{ roomId: string }>()
const online = useOnline()
const router = useRouter()

onMounted(async () => {
  if (online.view?.roomId !== props.roomId) await online.resume(props.roomId)
})
onBeforeUnmount(() => online.leaveScreen())
// Après une coupure : on dit clairement que la place est conservée, puis où en est la partie.
const wasOffline = ref(false)
const reconnected = ref(false)
let toast: ReturnType<typeof setTimeout> | null = null
watch(
  () => online.connection,
  (c) => {
    if (c === 'offline') wasOffline.value = true
    else if (c === 'online' && wasOffline.value) {
      wasOffline.value = false
      reconnected.value = true
      if (toast) clearTimeout(toast)
      toast = setTimeout(() => (reconnected.value = false), 5000)
    }
  },
)
onBeforeUnmount(() => toast && clearTimeout(toast))
const view = computed(() => (online.view?.roomId === props.roomId ? online.view : null))
function dropAndLeave(): void {
  forgetSession(props.roomId)
  void router.push('/en-ligne')
}
</script>

<template>
  <div class="mx-auto max-w-lg" :class="online.connection === 'offline' ? '[&_button]:pointer-events-none' : ''">
    <div v-if="online.connection === 'replaced'" class="err" role="alert">
      <p class="font-bold">Session ouverte ailleurs</p>
      <p>Ce salon a été repris depuis un autre onglet ou appareil. Cette fenêtre ne peut plus jouer.</p>
      <button class="btn mt-2 w-full" @click="online.resume(roomId)">Reprendre ici</button>
    </div>
    <div v-else-if="online.connection === 'kicked'" class="err" role="alert">
      <p class="font-bold">Vous avez été retiré du salon.</p>
      <RouterLink to="/en-ligne" class="btn mt-2 w-full">Retour</RouterLink>
    </div>
    <div v-else-if="online.connection === 'refused'" class="err" role="alert">
      <p class="font-bold">Impossible de reprendre cette place</p>
      <p>{{ online.error }}</p>
      <p class="mt-2 text-sm">
        Le secret de reconnexion est conservé uniquement sur l’appareil qui a rejoint le salon. Il n’est pas possible de
        reprendre une place avec le seul pseudo : demandez à l’hôte de retirer cette place puis rejoignez à nouveau avec
        le code.
      </p>
      <button class="btn mt-2 w-full" @click="dropAndLeave">Oublier ce salon</button>
    </div>
    <p v-else-if="!view" class="muted" role="status">
      {{
        online.connection === 'offline'
          ? (online.error ?? 'Serveur injoignable. Nouvelle tentative…')
          : 'Connexion au salon…'
      }}
    </p>
    <template v-else>
      <div
        v-if="online.connection === 'offline' || online.connection === 'connecting'"
        class="sticky top-0 z-40 mb-2 rounded-xl border-2 border-amber-600 bg-amber-100 p-2.5 text-center text-base font-semibold text-amber-950 shadow"
        role="alert"
        data-testid="offline-banner"
      >
        📡 Connexion perdue — reconnexion en cours…
        <span class="block text-sm font-normal"
          >Votre place est gardée. Les boutons sont désactivés jusqu’au retour du réseau.</span
        >
      </div>
      <p
        v-else-if="reconnected"
        class="sticky top-0 z-40 mb-2 rounded-xl border-2 border-teal-700 bg-teal-100 p-2.5 text-center text-base font-semibold text-teal-950 shadow"
        role="status"
        data-testid="reconnected-banner"
      >
        ✓ Reconnecté — la partie est à jour.
      </p>
      <OnlineLobby v-if="view.status === 'lobby'" :view="view" @left="router.push('/en-ligne')" />
      <TarotTable v-else-if="view.tarot" :view="view" />
      <OnlineTable v-else-if="view.status === 'playing'" :view="view" />
      <OnlineResult v-else-if="view.result" :view="view" />
      <p v-if="online.error && view.status === 'lobby'" class="err mt-3" role="alert">{{ online.error }}</p>
    </template>
  </div>
</template>
