<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Card, Seat } from '../../../shared/coinche/cards'
import { sameCard } from '../../../shared/coinche/cards'
import type { RoomView } from '../../../shared/coinche/views'
import { askConfirm } from '../../confirm'
import { ANNOUNCE_LABELS } from '../../engine/belote'
import { faceOfCard } from '../../cardface'
import HandFan from '../../components/HandFan.vue'
import type { HandItem } from '../../components/HandFan.vue'
import PlayingCard from '../../components/PlayingCard.vue'
import BottomSheet from '../../components/BottomSheet.vue'
import TableSeats from '../../components/table/TableSeats.vue'
import type { TableSeat } from '../../components/table/TableSeats.vue'
import { signed } from '../../labels'
import { SUIT_SYMBOLS } from '../../engine/types'
import { bidText, cardName, contractText, levelText, nameOfSeat, teamName } from '../labels'
import { useOnline } from '../store'
import BiddingPanel from './BiddingPanel.vue'
import CoincheWindow from './CoincheWindow.vue'
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

const seatInfo = (s: Seat) => {
  const pid = v.value.seats[s]
  return v.value.participants.find((p) => p.id === pid)
}
const ordered = computed(() => [0, 1, 2, 3].map((i) => ((me.value + i) % 4) as Seat))
const lastBidOf = (s: Seat): string => {
  const b = [...round.value.bids].reverse().find((x) => x.seat === s)
  if (!b) return ''
  return b.kind === 'pass'
    ? 'Passe'
    : b.kind === 'take'
      ? `Prend ${SUIT_SYMBOLS[b.suit]}`
      : b.kind === 'bid'
        ? `${b.value} ${SUIT_SYMBOLS[b.suit]}`
        : b.kind === 'capot'
          ? `Capot ${SUIT_SYMBOLS[b.suit]}`
          : b.kind === 'coinche'
            ? 'Coinche !'
            : b.kind === 'surcoinche'
              ? 'Surcoinche !'
              : 'Accepte'
}
const tableSeats = computed<TableSeat[]>(() =>
  ordered.value.map((s) => ({
    seat: s,
    name: nameOfSeat(v.value, s),
    isMe: s === me.value,
    connected: !!seatInfo(s)?.connected,
    turn: round.value.turn === s && round.value.phase !== 'summary' && !v.value.pause,
    dealer: round.value.dealer === s,
    taker: contract.value?.seat === s,
    partner: s === (me.value + 2) % 4,
    caption:
      round.value.phase === 'bidding'
        ? lastBidOf(s)
        : s !== me.value && round.value.phase !== 'summary'
          ? `🂠 ×${round.value.cardsLeft.at(s)}`
          : '',
  })),
)

// ----- Sélection et envoi d'une carte -----
const selected = ref<Card | null>(null)
const previewCard = ref<Card | null>(null)
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
    previewCard.value = null
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
const scoresOpen = ref(false)
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
const handItems = computed<HandItem[]>(() =>
  v.value.hand.map((c) => ({
    key: `${c.suit}:${c.rank}`,
    face: faceOfCard(c),
    state: cardState(c),
    label: `${cardName(c)}${myTurnToPlay.value ? (isPlayable(c) ? ', jouable' : ', non autorisée') : ''}`,
    pressed: !!selected.value && sameCard(selected.value, c),
  })),
)
function tapKey(key: string): void {
  const c = v.value.hand.find((x) => `${x.suit}:${x.rank}` === key)
  if (c) tap(c)
}
const plays = computed(() =>
  centerCards.value.map((t) => ({
    seat: t.seat,
    face: faceOfCard(t.card),
    winner: centerIsShown.value && shown.value?.winner === t.seat,
  })),
)
const inBidding = computed(() => round.value.phase === 'bidding' || round.value.phase === 'window')
const pct = (t: 0 | 1) => Math.min(100, Math.max(0, Math.round((v.value.totals[t] / v.value.config.target) * 100)))
</script>

<template>
  <div class="flex flex-col gap-2.5" data-testid="table">
    <!-- Scores, contrat, atout : toujours visibles, détail dans la feuille « Scores » -->
    <header class="card !p-2" aria-label="Scores et contrat">
      <div class="grid grid-cols-[1fr_1fr_auto] items-stretch gap-2 text-center">
        <div
          v-for="t in [0, 1] as const"
          :key="t"
          class="rounded-lg px-1 py-1"
          :class="t === myTeam ? 'bg-teal-100' : 'bg-stone-100'"
          :data-testid="`score-${t}`"
        >
          <p class="truncate text-xs font-semibold">{{ t === myTeam ? 'Nous' : 'Eux' }} · {{ teamName(v, t) }}</p>
          <p class="text-2xl font-bold leading-tight">{{ v.totals[t] }}</p>
          <p class="text-xs text-slate-600">Plis : {{ round.trickCounts[t] }}</p>
        </div>
        <button
          class="btn !min-h-0 flex-col !px-2.5 !py-1 text-sm"
          type="button"
          data-testid="open-scores"
          @click="scoresOpen = true"
        >
          <span aria-hidden="true">📋</span>Scores
        </button>
      </div>
      <p
        class="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center text-sm font-semibold"
        data-testid="contract-bar"
      >
        <template v-if="contract">
          <span class="chip !border-gold !bg-gold-soft">Contrat {{ contractText(contract) }}</span>
          <span>preneur : {{ nameOfSeat(v, contract.seat) }}</span>
          <span v-if="round.level !== 'none'" class="badge !bg-red-700 !text-white !text-sm">{{
            levelText(round.level)
          }}</span>
        </template>
        <span v-else class="muted !text-sm">Donne {{ round.index + 1 }} · pas encore de contrat</span>
      </p>
    </header>

    <div v-if="v.pause" class="note" role="alert" data-testid="pause">
      <p class="font-bold">⏸ Partie en pause</p>
      <p>{{ v.pause.reason }}</p>
      <p v-if="v.pause.disconnectedSeats.length" class="text-sm">
        Absent : {{ v.pause.disconnectedSeats.map((s) => nameOfSeat(v, s)).join(', ') }}. La partie reprend dès son
        retour.
      </p>
    </div>
    <div v-if="online.error" class="err" role="alert">
      {{ online.error }}
      <button class="btn mt-2 w-full" @click="online.error = null">Fermer ce message</button>
    </div>

    <!-- Enchères : une tuile par joueur avec sa dernière annonce -->
    <section v-if="inBidding" class="grid grid-cols-4 gap-1.5" aria-label="Enchères en cours" data-testid="bid-board">
      <div
        v-for="s in ordered"
        :key="s"
        class="rounded-xl border-2 px-1 py-1 text-center"
        :class="
          round.turn === s && round.phase === 'bidding'
            ? 'anim-turn border-gold bg-gold-soft'
            : 'border-stone-300 bg-white'
        "
      >
        <p class="flex items-center justify-center gap-0.5 text-xs font-bold" :title="nameOfSeat(v, s)">
          <span class="truncate">{{ s === me ? 'Vous' : nameOfSeat(v, s) }}</span>
          <span v-if="round.dealer === s" class="badge shrink-0 bg-stone-200" title="Donneur">D</span>
        </p>
        <p
          class="text-lg font-bold"
          :class="lastBidOf(s).includes('♥') || lastBidOf(s).includes('♦') ? 'text-suit-red' : ''"
        >
          {{ lastBidOf(s) || (round.turn === s ? '▶ parle' : '…') }}
        </p>
      </div>
      <div
        v-if="round.beloteDeal"
        class="col-span-4 flex items-center justify-center gap-3 rounded-xl bg-teal-800 p-1.5 text-white"
      >
        <span class="w-9"><PlayingCard :face="faceOfCard(round.beloteDeal.turned)" /></span>
        <span class="text-sm font-semibold">Carte retournée<br />{{ cardName(round.beloteDeal.turned) }}</span>
      </div>
    </section>

    <!-- Table -->
    <div v-else class="relative">
      <TableSeats :seats="tableSeats" :plays="plays" :fading="centerIsShown" />
      <p
        v-if="announce"
        class="anim-drop absolute inset-x-12 top-2 z-30 rounded-xl bg-gold p-1.5 text-center text-base font-bold text-slate-900 shadow-lg"
        role="status"
        data-testid="belote-announce"
      >
        {{ announce }}
      </p>
    </div>

    <!-- Qui doit agir -->
    <div v-if="!inBidding && round.phase === 'playing'" class="flex items-stretch gap-2">
      <p
        class="flex-1 rounded-xl p-2.5 text-center font-bold"
        :class="
          centerIsShown
            ? 'bg-gold-soft text-slate-900'
            : myTurnToPlay
              ? 'bg-teal-700 text-white'
              : 'bg-stone-200 text-slate-800'
        "
        role="status"
        data-testid="turn"
      >
        <template v-if="centerIsShown && shown">🏅 {{ nameOfSeat(v, shown.winner) }} remporte le pli</template>
        <template v-else-if="v.pause">⏸ En pause</template>
        <template v-else-if="myTurnToPlay">▶ À vous de jouer</template>
        <template v-else>{{ turnLabel }}…</template>
      </p>
      <button
        class="btn !min-h-0 !px-3 text-sm"
        :disabled="!round.lastTrick"
        data-testid="last-trick"
        @click="lastOpen = true"
      >
        ⟲ Dernier<br />pli
      </button>
    </div>

    <!-- Main -->
    <section v-if="inBidding && v.hand.length" aria-label="Votre main" class="rounded-2xl bg-stone-200/70 pb-1">
      <p class="px-3 pt-2 text-sm font-semibold text-slate-700">
        Votre main · {{ v.hand.length }} carte{{ v.hand.length > 1 ? 's' : '' }}
      </p>
      <HandFan :items="handItems" label="Cartes de votre main" compact @tap="tapKey" />
      <p v-if="hint" class="note mx-2 mb-2" role="status">{{ hint }}</p>
    </section>
    <!-- Phase -->
    <BiddingPanel v-if="round.phase === 'bidding'" :view="v" />
    <CoincheWindow v-else-if="round.phase === 'window'" :view="v" />
    <RoundSummary v-else-if="summaryRecord && summaryRecord.detail" :view="v" :record="summaryRecord" />

    <details
      v-if="round.announcements?.declared.length"
      class="rounded-xl border border-gold bg-gold-soft p-2.5"
      open
      aria-label="Annonces de belote"
    >
      <summary class="cursor-pointer text-base font-bold">Annonces de belote</summary>
      <ul class="mt-1 text-sm" data-testid="belote-declarations">
        <li v-for="(entry, index) in round.announcements.declared" :key="index">
          {{ nameOfSeat(v, entry.seat) }} · {{ ANNOUNCE_LABELS[entry.kind] }}
        </li>
      </ul>
      <p v-if="round.announcements.strongest === 'tie'" class="mt-1 text-sm font-semibold">
        Égalité : aucune annonce retenue.
      </p>
      <div v-else-if="round.announcements.revealed.length" class="mt-2" data-testid="belote-revealed">
        <h3 class="text-sm font-bold">Annonces retenues · {{ teamName(v, round.announcements.strongest!) }}</h3>
        <ul class="mt-1 space-y-1.5">
          <li v-for="(entry, index) in round.announcements.revealed" :key="index" class="text-sm">
            <span class="font-semibold">{{ nameOfSeat(v, entry.seat) }} · {{ ANNOUNCE_LABELS[entry.kind] }}</span>
            <span class="sr-only"> : {{ entry.cards.map(cardName).join(', ') }}</span>
            <span class="mt-0.5 flex gap-1" aria-hidden="true">
              <span v-for="c in entry.cards" :key="c.suit + c.rank" class="w-9"
                ><PlayingCard :face="faceOfCard(c)"
              /></span>
            </span>
          </li>
        </ul>
      </div>
    </details>

    <!-- Main -->
    <section
      v-if="!inBidding && v.hand.length && round.phase !== 'summary'"
      aria-label="Votre main"
      class="rounded-2xl bg-stone-200/70 pb-1"
    >
      <p class="px-3 pt-2 text-sm font-semibold text-slate-700">
        Votre main · {{ v.hand.length }} carte{{ v.hand.length > 1 ? 's' : '' }}
      </p>
      <p class="px-3 text-xs font-medium text-slate-700" aria-label="Repères de la main">
        ▶ Jouable · ✓ sélectionnée · × indisponible
      </p>
      <HandFan :items="handItems" label="Cartes de votre main" @tap="tapKey" />
      <p v-if="hint" class="note mx-2 mb-2" role="status">{{ hint }}</p>
    </section>
    <div
      v-if="selected && myTurnToPlay"
      class="sticky bottom-2 z-20 rounded-2xl border border-teal-900 bg-white p-2 shadow-xl"
    >
      <div class="flex gap-2">
        <button
          class="btn !min-w-24 !min-h-14"
          type="button"
          data-testid="preview-card"
          @click="previewCard = selected"
        >
          Agrandir
        </button>
        <button class="btn btn-primary flex-1 !min-h-14 text-lg" :disabled="busy" data-testid="play-card" @click="play">
          {{ busy ? 'Envoi en cours…' : `Jouer ${cardName(selected)}` }}
        </button>
      </div>
    </div>
    <!-- Scores et historique -->
    <BottomSheet v-if="previewCard" :title="`Aperçu : ${cardName(previewCard)}`" @close="previewCard = null">
      <div class="mx-auto w-48 max-w-[70vw]" data-testid="card-preview">
        <PlayingCard :face="faceOfCard(previewCard)" />
      </div>
      <p class="mt-3 text-center text-lg font-bold">{{ cardName(previewCard) }}</p>
      <p class="text-center text-sm text-slate-700">Cette carte n’est pas jouée.</p>
    </BottomSheet>
    <BottomSheet v-if="scoresOpen" title="Scores et historique" @close="scoresOpen = false">
      <div class="grid grid-cols-2 gap-2 text-center">
        <div v-for="t in [0, 1] as const" :key="t" class="rounded-xl bg-white p-2 shadow-sm">
          <p class="truncate font-semibold">{{ teamName(v, t) }}{{ t === myTeam ? ' (vous)' : '' }}</p>
          <p class="text-3xl font-bold">{{ v.totals[t] }}</p>
          <div class="mt-1 h-2 overflow-hidden rounded-full bg-stone-200" aria-hidden="true">
            <div class="h-full bg-teal-600" :style="{ width: pct(t) + '%' }" />
          </div>
          <p class="mt-0.5 text-xs text-slate-600">objectif {{ v.config.target }}</p>
        </div>
      </div>
      <h3 class="mt-4 font-bold">Annonces de cette donne</h3>
      <ol class="list-decimal pl-5 text-base">
        <li v-for="(b, i) in round.bids" :key="i">{{ bidText(v, b) }}</li>
        <li v-for="(e, i) in round.beloteEvents" :key="'b' + i" class="font-semibold">
          {{ e.stage === 'belote' ? 'Belote' : 'Rebelote' }} — {{ nameOfSeat(v, e.seat) }}
        </li>
      </ol>
      <h3 class="mt-4 font-bold">Donnes précédentes</h3>
      <p v-if="!history.length" class="muted">Aucune.</p>
      <ul class="space-y-1" data-testid="history">
        <li v-for="h in history" :key="h.index">
          Donne {{ h.index + 1 }} :
          <template v-if="h.passed">tout le monde a passé (aucun point)</template>
          <template v-else
            >{{ contractText(h.contract) }} {{ nameOfSeat(v, h.contract!.seat) }} — {{ signed(h.delta[0]) }} /
            {{ signed(h.delta[1]) }}</template
          >
        </li>
      </ul>
      <button v-if="v.actions.canAbandon" class="btn mt-5 w-full" @click="abandon">Abandonner la partie</button>
    </BottomSheet>

    <BottomSheet v-if="lastOpen && round.lastTrick" title="Dernier pli" @close="lastOpen = false">
      <p class="mb-3">
        Remporté par <strong>{{ nameOfSeat(v, round.lastTrick.winner) }}</strong
        >.
      </p>
      <ul class="grid grid-cols-4 gap-2">
        <li
          v-for="t in round.lastTrick.cards"
          :key="t.seat"
          class="flex flex-col items-center gap-1 text-center text-sm"
        >
          <PlayingCard :face="faceOfCard(t.card)" :highlight="t.seat === round.lastTrick.winner" />
          <span class="w-full truncate">{{ nameOfSeat(v, t.seat) }}</span>
        </li>
      </ul>
    </BottomSheet>
  </div>
</template>
