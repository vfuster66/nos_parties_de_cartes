<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Card, Seat } from '../../../shared/coinche/cards'
import { sameCard } from '../../../shared/coinche/cards'
import type { RoomView } from '../../../shared/coinche/views'
import { askConfirm } from '../../confirm'
import { signed } from '../../labels'
import { bidText, cardName, contractText, levelText, nameOfSeat, relPos, teamName } from '../labels'
import { useOnline } from '../store'
import BiddingPanel from './BiddingPanel.vue'
import CoincheWindow from './CoincheWindow.vue'
import PlayingCard from './PlayingCard.vue'
import RoundSummary from './RoundSummary.vue'

const props = defineProps<{ view: RoomView }>()
const online = useOnline()
const v = computed(() => props.view)
const round = computed(() => v.value.round!)
const me = computed(() => v.value.you.seat as Seat)
const busy = computed(() => !!online.pending)
const myTurnToPlay = computed(() => round.value.phase === 'playing' && round.value.turn === me.value && !v.value.pause)
const contract = computed(() => round.value.contract)
const summaryRecord = computed(() =>
  round.value.phase === 'summary' ? (v.value.rounds[v.value.rounds.length - 1] ?? null) : null,
)

const SEATS: Seat[] = [0, 1, 2, 3]
const bySlot = computed(() => {
  const m = {} as Record<0 | 1 | 2 | 3, Seat>
  for (const s of SEATS) m[relPos(me.value, s)] = s
  return m
})
const slotClass: Record<0 | 1 | 2 | 3, string> = {
  0: 'bottom-0 left-1/2 -translate-x-1/2',
  1: 'left-0 top-1/2 -translate-y-1/2',
  2: 'top-0 left-1/2 -translate-x-1/2',
  3: 'right-0 top-1/2 -translate-y-1/2',
}
const seatInfo = (s: Seat) => {
  const pid = v.value.seats[s]
  return v.value.participants.find((p) => p.id === pid)
}

// ----- Sélection et envoi d'une carte -----
const selected = ref<Card | null>(null)
const hint = ref('')
const isPlayable = (c: Card): boolean => v.value.actions.playable.some((x) => sameCard(x, c))
function cardState(c: Card) {
  if (selected.value && sameCard(selected.value, c)) return online.pending === 'playCard' ? 'pending' : 'selected'
  if (!myTurnToPlay.value) return 'normal'
  return isPlayable(c) ? 'playable' : 'blocked'
}
function tap(c: Card): void {
  hint.value = ''
  if (!myTurnToPlay.value) {
    hint.value =
      round.value.phase === 'playing' ? "Ce n'est pas votre tour." : 'La phase de jeu des cartes n’a pas commencé.'
    return
  }
  if (!isPlayable(c)) {
    hint.value = 'Carte non autorisée : vous devez respecter la couleur demandée, couper ou monter selon les règles.'
    return
  }
  selected.value = selected.value && sameCard(selected.value, c) ? null : c
}
async function play(): Promise<void> {
  if (selected.value) await online.send('playCard', { card: selected.value })
}
// La carte reste affichée tant que le serveur n'a pas confirmé ; on ne désélectionne que si elle a disparu ou si ce n'est plus notre tour.
watch(
  () => v.value.version,
  () => {
    if (!myTurnToPlay.value || (selected.value && !v.value.hand.some((c) => sameCard(c, selected.value!))))
      selected.value = null
  },
)

// ----- Dernier pli visible un moment, puis consultable -----
const shown = ref<{ cards: { seat: Seat; card: Card }[]; winner: Seat } | null>(null)
let shownTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => [round.value.index, round.value.tricks.length] as const,
  ([, n], [, prevN]) => {
    if (n > prevN && round.value.lastTrick) {
      shown.value = round.value.lastTrick
      if (shownTimer) clearTimeout(shownTimer)
      shownTimer = setTimeout(() => (shown.value = null), 2200)
    } else if (n < prevN) shown.value = null
  },
)
onBeforeUnmount(() => shownTimer && clearTimeout(shownTimer))
const lastOpen = ref(false)
const centerCards = computed(() => (round.value.trick.length ? round.value.trick : (shown.value?.cards ?? [])))
const centerIsShown = computed(() => !round.value.trick.length && !!shown.value)

// ----- Annonces de belote (à tous) -----
const announce = ref('')
let announceTimer: ReturnType<typeof setTimeout> | null = null
let seenBelote = round.value.beloteEvents.length
watch(
  () => round.value.beloteEvents.length,
  (n) => {
    if (n > seenBelote) {
      const e = round.value.beloteEvents[n - 1]
      announce.value = `${e.stage === 'belote' ? 'Belote' : 'Rebelote'} ! (${nameOfSeat(v.value, e.seat)})`
      if (announceTimer) clearTimeout(announceTimer)
      announceTimer = setTimeout(() => (announce.value = ''), 3500)
    }
    seenBelote = n
  },
)
onBeforeUnmount(() => announceTimer && clearTimeout(announceTimer))

const history = computed(() => v.value.rounds.slice().reverse())
async function abandon(): Promise<void> {
  if (
    !(await askConfirm({
      title: 'Abandonner la partie ?',
      message: 'La partie sera abandonnée pour les quatre joueurs. Aucune victoire ne sera attribuée.',
      confirmLabel: 'Abandonner',
    }))
  )
    return
  await online.send('abandon', { confirm: true })
}
const myTeam = computed(() => (me.value % 2) as 0 | 1)
const turnLabel = computed(() => {
  if (round.value.phase === 'playing' && round.value.turn != null)
    return round.value.turn === me.value ? 'À vous de jouer' : `Au tour de ${nameOfSeat(v.value, round.value.turn)}`
  return ''
})
</script>

<template>
  <div class="flex flex-col gap-3" data-testid="table">
    <!-- Scores, contrat, atout -->
    <header class="card !p-3" aria-label="Scores et contrat">
      <div class="grid grid-cols-2 gap-2 text-center">
        <div
          v-for="t in [0, 1] as const"
          :key="t"
          class="rounded-lg p-1"
          :class="t === myTeam ? 'bg-teal-50' : 'bg-amber-50'"
          :data-testid="`score-${t}`"
        >
          <p class="truncate text-sm font-semibold">{{ teamName(v, t) }}<span v-if="t === myTeam"> (vous)</span></p>
          <p class="text-2xl font-bold">{{ v.totals[t] }}</p>
          <p class="muted text-sm">Plis : {{ round.trickCounts[t] }}</p>
        </div>
      </div>
      <p class="muted mt-1 text-center text-sm">Donne {{ round.index + 1 }} · objectif {{ v.config.target }}</p>
      <p
        class="mt-1 flex flex-wrap items-center justify-center gap-x-3 text-center font-semibold"
        data-testid="contract-bar"
      >
        <template v-if="contract">
          <span>Contrat {{ contractText(contract) }}</span>
          <span>preneur : {{ nameOfSeat(v, contract.seat) }}</span>
          <span v-if="round.level !== 'none'" class="rounded bg-red-700 px-2 text-white">{{
            levelText(round.level)
          }}</span>
        </template>
        <span v-else class="muted">Pas encore de contrat</span>
      </p>
    </header>

    <div v-if="v.pause" class="note" role="alert" data-testid="pause">
      <p class="font-bold">⏸ Partie en pause</p>
      <p>{{ v.pause.reason }}</p>
      <p v-if="v.pause.disconnectedSeats.length" class="text-sm">
        Absent : {{ v.pause.disconnectedSeats.map((s) => nameOfSeat(v, s)).join(', ') }}
      </p>
    </div>
    <div v-if="online.connection !== 'online'" class="err" role="alert">
      Connexion au serveur interrompue. Reconnexion automatique en cours…
    </div>
    <div v-if="online.error" class="err" role="alert">
      {{ online.error }}
      <button class="btn mt-2 w-full" @click="online.error = null">Fermer ce message</button>
    </div>

    <!-- Table -->
    <section
      class="relative h-72 rounded-2xl border-2 border-teal-900 bg-teal-800 p-1 text-white"
      aria-label="Table de jeu"
    >
      <div
        v-for="slot in [0, 1, 2, 3] as const"
        :key="slot"
        class="absolute z-10 max-w-[5rem] rounded-lg bg-black/40 px-2 py-1 text-center text-sm"
        :class="[slotClass[slot], round.turn === bySlot[slot] ? 'ring-4 ring-amber-400' : '']"
        :data-testid="`seat-tag-${slot}`"
      >
        <p class="truncate font-semibold">
          <span
            :class="seatInfo(bySlot[slot])?.connected ? 'text-emerald-300' : 'text-red-300'"
            :aria-label="seatInfo(bySlot[slot])?.connected ? 'connecté' : 'déconnecté'"
            >●</span
          >
          {{ seatInfo(bySlot[slot])?.nickname }}{{ slot === 0 ? ' (vous)' : '' }}
        </p>
        <p class="text-xs">
          <span v-if="round.dealer === bySlot[slot]" class="rounded bg-white/20 px-1">Donneur</span>
          <span v-if="contract?.seat === bySlot[slot]" class="rounded bg-amber-500 px-1 text-black">Preneur</span>
          <span v-if="slot !== 0 && round.phase !== 'summary'"> 🂠 ×{{ round.cardsLeft.at(bySlot[slot]) }}</span>
        </p>
      </div>
      <!-- Cartes du pli, placées côté de leur auteur -->
      <div
        v-for="t in centerCards"
        :key="t.seat"
        class="absolute z-0"
        :class="[
          {
            0: 'bottom-14 left-1/2 -translate-x-1/2',
            1: 'left-[5.25rem] top-1/2 -translate-y-1/2',
            2: 'left-1/2 top-12 -translate-x-1/2',
            3: 'right-[5.25rem] top-1/2 -translate-y-1/2',
          }[relPos(me, t.seat)],
          centerIsShown ? 'opacity-70' : '',
        ]"
        data-testid="trick-card"
      >
        <PlayingCard :card="t.card" size="md" :highlight="centerIsShown && shown?.winner === t.seat" />
      </div>
      <p
        v-if="centerIsShown && shown"
        class="absolute inset-x-0 top-1/2 z-20 mt-12 text-center text-sm font-semibold"
        role="status"
      >
        {{ nameOfSeat(v, shown.winner) }} remporte le pli
      </p>
      <p
        v-if="announce"
        class="absolute inset-x-2 top-1/2 z-30 -translate-y-1/2 rounded-xl bg-amber-400 p-2 text-center text-xl font-bold text-black"
        role="status"
        data-testid="belote-announce"
      >
        {{ announce }}
      </p>
    </section>

    <!-- Phase -->
    <BiddingPanel v-if="round.phase === 'bidding'" :view="v" />
    <CoincheWindow v-else-if="round.phase === 'window'" :view="v" />
    <RoundSummary v-else-if="summaryRecord && summaryRecord.detail" :view="v" :record="summaryRecord" />
    <p
      v-else-if="turnLabel"
      class="rounded-lg bg-slate-100 p-3 text-center text-lg font-semibold"
      role="status"
      data-testid="turn"
    >
      {{ turnLabel }}
    </p>

    <!-- Main -->
    <section v-if="v.hand.length" aria-label="Votre main">
      <ul class="grid grid-cols-4 gap-2">
        <li v-for="c in v.hand" :key="`${c.suit}${c.rank}`" class="flex justify-center">
          <button
            class="rounded-lg p-0.5"
            :aria-label="`${cardName(c)}${myTurnToPlay ? (isPlayable(c) ? ', jouable' : ', non autorisée') : ''}`"
            :aria-pressed="!!selected && sameCard(selected, c)"
            :data-testid="'hand-card'"
            :data-card="`${c.suit}:${c.rank}`"
            :data-state="cardState(c)"
            @click="tap(c)"
          >
            <PlayingCard :card="c" size="lg" :state="cardState(c)" />
          </button>
        </li>
      </ul>
      <p v-if="hint" class="note mt-2" role="status">{{ hint }}</p>
      <button
        v-if="selected && myTurnToPlay"
        class="btn btn-primary mt-2 w-full !min-h-14"
        :disabled="busy"
        data-testid="play-card"
        @click="play"
      >
        {{ busy ? 'Envoi en cours…' : `Jouer ${cardName(selected)}` }}
      </button>
      <p v-else-if="myTurnToPlay" class="mt-2 text-center font-semibold text-teal-900" role="status">
        À vous de jouer : touchez une carte autorisée.
      </p>
    </section>

    <!-- Outils -->
    <div class="grid grid-cols-2 gap-2">
      <button class="btn" :disabled="!round.lastTrick" data-testid="last-trick" @click="lastOpen = true">
        Dernier pli
      </button>
      <button v-if="v.actions.canAbandon" class="btn" @click="abandon">Abandonner la partie</button>
    </div>
    <details class="card">
      <summary class="cursor-pointer font-semibold">Historique public</summary>
      <h3 class="mt-2 font-bold">Annonces de cette donne</h3>
      <ol class="list-decimal pl-5">
        <li v-for="(b, i) in round.bids" :key="i">{{ bidText(v, b) }}</li>
        <li v-for="(e, i) in round.beloteEvents" :key="'b' + i" class="font-semibold">
          {{ e.stage === 'belote' ? 'Belote' : 'Rebelote' }} — {{ nameOfSeat(v, e.seat) }}
        </li>
      </ol>
      <h3 class="mt-2 font-bold">Donnes précédentes</h3>
      <p v-if="!history.length" class="muted">Aucune.</p>
      <ul>
        <li v-for="h in history" :key="h.index">
          Donne {{ h.index + 1 }} :
          <template v-if="h.passed">tout le monde a passé (aucun point)</template>
          <template v-else
            >{{ contractText(h.contract) }} {{ nameOfSeat(v, h.contract!.seat) }} — {{ signed(h.delta[0]) }} /
            {{ signed(h.delta[1]) }}</template
          >
        </li>
      </ul>
    </details>

    <div
      v-if="lastOpen && round.lastTrick"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lt-title"
    >
      <div class="card w-full max-w-md">
        <h2 id="lt-title" class="text-xl font-bold">Dernier pli</h2>
        <p class="mb-2">Remporté par {{ nameOfSeat(v, round.lastTrick.winner) }}.</p>
        <ul class="grid grid-cols-4 gap-2">
          <li v-for="t in round.lastTrick.cards" :key="t.seat" class="flex flex-col items-center text-center text-sm">
            <PlayingCard :card="t.card" size="md" :highlight="t.seat === round.lastTrick.winner" />
            <span class="truncate">{{ nameOfSeat(v, t.seat) }}</span>
          </li>
        </ul>
        <button class="btn btn-primary mt-3 w-full" autofocus @click="lastOpen = false">Fermer</button>
      </div>
    </div>
  </div>
</template>
