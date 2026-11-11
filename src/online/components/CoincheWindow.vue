<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { RoomView } from '../../../shared/coinche/views'
import { contractText, nameOfSeat } from '../labels'
import { useOnline } from '../store'

const props = defineProps<{ view: RoomView }>()
const online = useOnline()
const w = computed(() => props.view.round!.window!)
const a = computed(() => props.view.actions)

// Estimation locale du temps restant : le serveur reste maître de l'échéance.
const remaining = ref(0)
let baseline = 0
let at = 0
let timer: ReturnType<typeof setInterval> | null = null
function resync(): void {
  baseline = w.value.remainingMs
  at = Date.now()
  remaining.value = baseline
}
function tickDown(): void {
  remaining.value = w.value.running ? Math.max(0, baseline - (Date.now() - at)) : baseline
}
watch(() => [props.view.version, w.value.remainingMs, w.value.running], resync, { immediate: true })
timer = setInterval(tickDown, 200)
onBeforeUnmount(() => timer && clearInterval(timer))
const seconds = computed(() => Math.ceil(remaining.value / 1000))
const busy = computed(() => !!online.pending)
const takerTeam = computed(() => (props.view.round!.contract!.seat % 2) as 0 | 1)
const isTaker = computed(() => props.view.you.seat != null && props.view.you.seat % 2 === takerTeam.value)
const pct = computed(() => Math.round((remaining.value / 10000) * 100))
</script>

<template>
  <section
    class="card flex flex-col gap-3 !border-2 !border-red-700 !bg-red-50"
    aria-labelledby="win-title"
    data-testid="coinche-window"
  >
    <h2 id="win-title" class="text-lg font-bold text-red-800">⚡ Contrat coinché</h2>
    <p>
      {{ contractText(view.round!.contract) }} de {{ nameOfSeat(view, view.round!.contract!.seat) }} est coinché.
      <template v-if="isTaker">Vous pouvez surcoincher (×3) ou accepter.</template>
      <template v-else>Les preneurs peuvent surcoincher (×3).</template>
    </p>
    <div class="h-3 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
      <div class="h-full bg-red-600" :style="{ width: pct + '%' }" />
    </div>
    <p class="text-center text-3xl font-bold" role="timer" aria-live="off" data-testid="window-timer">
      {{ w.running ? `${seconds} s` : `${seconds} s (en pause)` }}
    </p>
    <p class="muted text-center text-sm">Décompte indicatif : le serveur décide de l’échéance.</p>
    <div v-if="isTaker && !view.pause" class="grid grid-cols-1 gap-2">
      <button
        v-if="a.canSurcoinche"
        class="btn btn-danger !min-h-14"
        :disabled="busy"
        data-testid="surcoinche"
        @click="online.send('surcoinche')"
      >
        Surcoincher
      </button>
      <button
        v-if="a.canAcceptCoinche"
        class="btn !min-h-14"
        :disabled="busy"
        data-testid="accept-coinche"
        @click="online.send('acceptCoinche')"
      >
        Accepter la coinche
      </button>
      <p v-else-if="w.acceptedSeats.includes(view.you.seat!)" class="muted text-center">
        Vous avez accepté. En attente de votre partenaire ou de l’échéance.
      </p>
    </div>
  </section>
</template>
