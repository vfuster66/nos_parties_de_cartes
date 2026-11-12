<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { Seat } from '../../../shared/coinche/cards'
import type { RoomView } from '../../../shared/coinche/views'
import type { TarotCard } from '../../../shared/tarot/cards'
import { isTrump } from '../../../shared/tarot/cards'
import type { TarotBonusType } from '../../engine/types'
import { SUIT_SYMBOLS, TAROT_BONUS_LABELS, TAROT_CONTRACT_LABELS } from '../../engine/types'
import { faceName, faceOfTarot } from '../../cardface'
import { askConfirm } from '../../confirm'
import HandFan from '../../components/HandFan.vue'
import PlayingCard from '../../components/PlayingCard.vue'
import BottomSheet from '../../components/BottomSheet.vue'
import TableSeats from '../../components/table/TableSeats.vue'
import type { TableSeat } from '../../components/table/TableSeats.vue'
import { nameOfSeat } from '../labels'
import { useOnline } from '../store'

const props = defineProps<{ view: RoomView }>()
const online = useOnline()
const tarot = computed(() => props.view.tarot!)
const active = computed(() => props.view.status === 'playing')
const busy = computed(() => !!online.pending)
const me = computed(() => props.view.you.seat)
const n = computed(() => props.view.seats.length)
const player = (seat: Seat | number) => nameOfSeat(props.view, seat as Seat)
const selected = ref<TarotCard[]>([])
const previewCard = ref<TarotCard | null>(null)
const announcements = ref<Exclude<TarotBonusType, 'petitAuBout'>[]>([])
const scoresOpen = ref(false)
const lastOpen = ref(false)
const trickOpen = ref(false)
watch(
  () => [tarot.value.phase, tarot.value.turn],
  () => {
    selected.value = []
    previewCard.value = null
    announcements.value = []
  },
)
const label = (card: TarotCard): string => faceName(faceOfTarot(card))
/** Libellé court pour le texte courant (Roi de pique → « R♠ »). */
function short(card: TarotCard): string {
  if (card === 'excuse') return 'Excuse'
  const [suit, rank] = card.split(':')
  return suit === 'atout' ? `Atout ${rank}` : `${rank}${SUIT_SYMBOLS[suit as keyof typeof SUIT_SYMBOLS]}`
}
const handfulSize = computed(() => {
  const type = announcements.value.find((i) => i === 'poigneSimple' || i === 'poigneDouble' || i === 'poigneTriple')
  return type ? tarot.value.handfulSizes[type] : 0
})
const myTurn = computed(() => active.value && me.value != null && tarot.value.turn === me.value && !props.view.pause)
const isResting = computed(() => me.value != null && tarot.value.restingSeat === me.value)
const canSelect = (card: TarotCard): boolean =>
  tarot.value.actions.discard.includes(card) ||
  (tarot.value.actions.canDeclare && handfulSize.value > 0 && (isTrump(card) || card === 'excuse')) ||
  tarot.value.actions.playable.includes(card)
const selecting = computed(
  () =>
    tarot.value.actions.discard.length > 0 || tarot.value.actions.canDeclare || tarot.value.actions.playable.length > 0,
)
function toggle(card: TarotCard): void {
  selected.value = selected.value.includes(card)
    ? selected.value.filter((item) => item !== card)
    : tarot.value.phase === 'playing'
      ? [card]
      : [...selected.value, card]
}
const sortedHand = computed(() =>
  [...tarot.value.hand].sort((a, b) => {
    const suits = ['atout', 'excuse', 'pique', 'coeur', 'trefle', 'carreau']
    const [aSuit, aRank] = a.split(':')
    const [bSuit, bRank] = b.split(':')
    const rank = (r: string) => ({ V: 11, C: 12, D: 13, R: 14 })[r] ?? Number(r)
    return suits.indexOf(aSuit) - suits.indexOf(bSuit) || rank(bRank) - rank(aRank)
  }),
)
const handItems = computed(() =>
  sortedHand.value.map((card) => {
    const on = selected.value.includes(card)
    const ok = canSelect(card)
    return {
      key: card,
      face: faceOfTarot(card),
      state: on
        ? busy.value
          ? ('pending' as const)
          : ('selected' as const)
        : selecting.value
          ? ok
            ? 'playable'
            : 'blocked'
          : 'normal',
      label: `${label(card)}${selecting.value ? (ok ? ', autorisée' : ', non autorisée') : ''}${on ? ', sélectionnée' : ''}`,
      disabled: busy.value,
      pressed: on,
    } as const
  }),
)
function tap(key: string): void {
  const card = key as TarotCard
  if (selecting.value && !canSelect(card)) return
  toggle(card)
}
const announce = () =>
  online.send('tarotDeclare', { types: announcements.value, shown: handfulSize.value ? selected.value : [] })
async function playSelected(): Promise<void> {
  if (selected.value[0] && (await online.send('tarotPlay', { card: selected.value[0] }))) selected.value = []
}

const ordered = computed<Seat[]>(() =>
  Array.from({ length: n.value }, (_, i) => (((me.value ?? 0) + i) % n.value) as Seat),
)
const tableSeats = computed<TableSeat[]>(() =>
  ordered.value.map((s) => ({
    seat: s,
    name: player(s),
    isMe: s === me.value,
    connected: !!props.view.participants.find((p) => p.id === props.view.seats[s])?.connected,
    turn: active.value && tarot.value.phase !== 'summary' && tarot.value.turn === s && !props.view.pause,
    dealer: tarot.value.dealer === s && tarot.value.restingSeat === null,
    taker: tarot.value.taker === s,
    called: tarot.value.partner === s,
    resting: tarot.value.restingSeat === s,
  })),
)
const plays = computed(() => tarot.value.trick.map((p) => ({ seat: p.seat, face: faceOfTarot(p.card) })))
const results = computed(() =>
  tarot.value.totals
    .map((score, seat) => ({
      seat,
      name: player(seat),
      score,
      delta: tarot.value.detail?.score.delta[seat],
    }))
    .sort((a, b) => b.score - a.score),
)
const myRow = computed(() => results.value.findIndex((r) => r.seat === me.value))
const PHASES: Record<string, string> = {
  bidding: 'Enchères',
  call: 'Appel',
  discard: 'Écart',
  declare: 'Annonces',
  playing: 'Jeu des cartes',
  summary: 'Résultat',
}
const banner = computed(() => {
  const t = tarot.value
  if (props.view.pause) return { tone: 'wait', text: '⏸ Partie en pause' }
  if (isResting.value && t.phase !== 'summary')
    return { tone: 'wait', text: '☕ Vous êtes au repos : vous suivez la donne' }
  if (myTurn.value)
    return {
      tone: 'me',
      text:
        t.phase === 'bidding'
          ? '▶ À vous d’annoncer'
          : t.phase === 'call'
            ? '▶ À vous d’appeler un roi'
            : t.phase === 'discard'
              ? `▶ À vous de faire l’écart (${t.dogSize} cartes)`
              : t.phase === 'declare'
                ? '▶ À vous : annonces avant le premier pli'
                : '▶ À vous de jouer',
    }
  if (t.turn != null) return { tone: 'wait', text: `En attente de ${player(t.turn)}…` }
  return { tone: 'wait', text: '' }
})
async function abandon() {
  if (
    await askConfirm({
      title: 'Abandonner la partie ?',
      message: 'Les joueurs retourneront à l’écran de résultat.',
      confirmLabel: 'Abandonner',
    })
  )
    await online.send('abandon', { confirm: true })
}
</script>

<template>
  <div class="flex flex-col gap-2.5" data-testid="tarot-table">
    <header class="card !p-2.5" aria-label="Contrat et scores">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="eyebrow">Tarot à {{ n }} · {{ PHASES[tarot.phase] }}</p>
          <p v-if="tarot.contract && tarot.taker !== null" class="font-bold" data-testid="contract-bar">
            <span class="chip !border-gold !bg-gold-soft">{{ TAROT_CONTRACT_LABELS[tarot.contract] }}</span>
            {{ player(tarot.taker) }}
          </p>
          <p v-else class="muted !text-sm">Pas encore de contrat</p>
          <p v-if="tarot.calledCard" class="mt-1 flex items-center gap-2 text-sm">
            Roi appelé
            <span class="w-8"><PlayingCard :face="faceOfTarot(tarot.calledCard)" /></span>
            <span>
              <template v-if="tarot.partner !== null">→ {{ player(tarot.partner) }}</template>
              <template v-else-if="tarot.phase === 'summary'">→ le preneur jouait seul</template>
              <template v-else>→ pas encore connu</template>
            </span>
          </p>
        </div>
        <button
          class="btn !min-h-0 shrink-0 flex-col !px-3 !py-1 text-sm"
          type="button"
          data-testid="open-scores"
          @click="scoresOpen = true"
        >
          <span aria-hidden="true">📋</span>Scores
        </button>
      </div>
      <p v-if="myRow >= 0 && results.length" class="mt-1 text-sm text-slate-700">
        Vous : <strong>{{ tarot.totals[me!] }} pts</strong> · {{ myRow + 1 }}<sup>e</sup>/{{ n }}
      </p>
    </header>

    <p v-if="view.pause" class="note" role="alert" data-testid="pause">
      ⏸ {{ view.pause.reason }}
      <span v-if="view.pause.disconnectedSeats.length" class="block text-sm"
        >Absent : {{ view.pause.disconnectedSeats.map((s) => player(s)).join(', ') }}. La partie reprend dès son
        retour.</span
      >
    </p>
    <p v-if="online.error" class="err" role="alert">{{ online.error }}</p>

    <template v-if="active">
      <TableSeats :seats="tableSeats" :plays="plays" />

      <div class="flex items-stretch gap-2">
        <p
          class="flex-1 rounded-xl p-2.5 text-center font-bold"
          :class="banner.tone === 'me' ? 'bg-teal-700 text-white' : 'bg-stone-200 text-slate-800'"
          role="status"
          data-testid="turn"
        >
          {{ banner.text }}
        </p>
        <button
          v-if="tarot.phase === 'playing'"
          class="btn !min-h-0 !px-3 text-sm"
          :disabled="!tarot.lastTrick"
          @click="lastOpen = true"
        >
          ⟲ Dernier<br />pli
        </button>
      </div>
      <p v-if="tarot.phase === 'playing'" class="text-center text-sm text-slate-600">
        Pli {{ tarot.trickCount + 1 }} sur {{ tarot.trickLimit }}
      </p>

      <section
        v-if="tarot.phase === 'bidding'"
        class="card flex flex-col gap-2 !border-2 !border-teal-700"
        aria-label="Enchères"
      >
        <ul v-if="tarot.bids.length" class="flex flex-wrap gap-1.5">
          <li v-for="bid in tarot.bids" :key="bid.seat" class="chip">
            {{ player(bid.seat) }} : {{ bid.contract ? TAROT_CONTRACT_LABELS[bid.contract] : 'passe' }}
          </li>
        </ul>
        <div v-if="tarot.actions.bids.length" class="grid grid-cols-2 gap-2">
          <button
            v-for="contract in tarot.actions.bids"
            :key="contract"
            class="btn btn-primary !min-h-14"
            :disabled="busy"
            @click="online.send('tarotBid', { contract })"
          >
            {{ TAROT_CONTRACT_LABELS[contract] }}
          </button>
        </div>
        <button v-if="tarot.actions.canPass" class="btn !min-h-14" :disabled="busy" @click="online.send('pass')">
          Passer
        </button>
      </section>

      <section
        v-if="tarot.phase === 'call'"
        class="card flex flex-col gap-2 !border-2 !border-teal-700"
        aria-label="Appel du roi"
      >
        <template v-if="tarot.actions.calls.length">
          <p class="font-semibold">Appeler le roi</p>
          <div class="grid grid-cols-4 gap-2">
            <button
              v-for="card in tarot.actions.calls"
              :key="card"
              class="btn !flex-col !gap-1 !px-1 !py-1"
              :disabled="busy"
              :aria-label="`Appeler ${label(card)}`"
              @click="online.send('tarotCall', { card })"
            >
              <span class="w-full max-w-12"><PlayingCard :face="faceOfTarot(card)" /></span>
            </button>
          </div>
        </template>
      </section>

      <section
        v-if="tarot.phase === 'discard'"
        class="card flex flex-col gap-2 !border-2 !border-teal-700"
        aria-label="Chien et écart"
      >
        <p class="font-semibold">Chien ({{ tarot.dog.length || tarot.dogSize }} cartes)</p>
        <ul v-if="tarot.dog.length" class="flex gap-1.5">
          <li v-for="card in tarot.dog" :key="card" class="w-11"><PlayingCard :face="faceOfTarot(card)" /></li>
        </ul>
        <template v-if="tarot.actions.discard.length">
          <p class="text-sm">Écarter {{ tarot.dogSize }} cartes</p>
          <button
            class="btn btn-primary !min-h-14"
            :disabled="selected.length !== tarot.dogSize || busy"
            @click="online.send('tarotDiscard', { cards: selected })"
          >
            Valider l’écart ({{ selected.length }}/{{ tarot.dogSize }})
          </button>
        </template>
      </section>

      <section
        v-if="tarot.actions.canDeclare"
        class="card flex flex-col gap-2 !border-2 !border-teal-700"
        aria-label="Annonces"
      >
        <p class="font-semibold">Annonces</p>
        <label
          v-for="type in tarot.actions.declarations"
          :key="type"
          class="flex min-h-12 items-center gap-3 rounded-xl border-2 border-stone-300 px-3"
        >
          <input v-model="announcements" type="checkbox" :value="type" class="h-6 w-6" />
          {{ TAROT_BONUS_LABELS[type] }}
        </label>
        <p v-if="handfulSize" class="note">Choisir {{ handfulSize }} atouts</p>
        <button
          class="btn btn-primary !min-h-14"
          :disabled="busy || (handfulSize > 0 && selected.length !== handfulSize)"
          @click="announce"
        >
          {{
            announcements.length ? `Valider (${selected.length}/${handfulSize || 0} cartes)` : 'Continuer sans annonce'
          }}
        </button>
      </section>

      <section
        v-if="tarot.shownDiscard.length || tarot.declarations.some((d) => d.types.length)"
        class="rounded-xl border border-gold bg-gold-soft p-2.5 text-sm"
        aria-label="Annonces de la donne"
      >
        <p v-if="tarot.shownDiscard.length">Atouts écartés : {{ tarot.shownDiscard.map(short).join(' · ') }}</p>
        <p v-for="entry in tarot.declarations.filter((item) => item.types.length)" :key="entry.seat">
          <strong>{{ player(entry.seat) }}</strong> :
          {{ entry.types.map((type) => TAROT_BONUS_LABELS[type]).join(', ') }}
          <span v-if="entry.shown.length">({{ entry.shown.map(short).join(' · ') }})</span>
        </p>
      </section>
    </template>

    <!-- Résultat de la donne -->
    <section v-if="tarot.detail" class="card flex flex-col gap-3" data-testid="round-summary">
      <p class="eyebrow">Résultat de la donne</p>
      <p
        class="rounded-xl p-3 text-center text-xl font-bold"
        :class="tarot.detail.score.outcome === 'success' ? 'bg-teal-700 text-white' : 'bg-stone-200'"
        data-testid="outcome"
      >
        {{ tarot.detail.score.outcome === 'success' ? '✓ Contrat réussi' : '✗ Contrat chuté' }}
        <span class="block text-base font-semibold"
          >{{ tarot.detail.points }} points · {{ tarot.detail.bouts }} bout(s)</span
        >
      </p>
      <table class="w-full text-left" aria-label="Scores après la donne">
        <thead>
          <tr class="text-sm text-slate-600">
            <th scope="col">Joueur</th>
            <th scope="col" class="text-right">Cette donne</th>
            <th scope="col" class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in results" :key="row.seat" :class="row.seat === me ? 'font-bold' : ''">
            <th scope="row" class="truncate font-normal">{{ row.name }}{{ row.seat === me ? ' (vous)' : '' }}</th>
            <td class="text-right">{{ row.delta !== undefined ? (row.delta > 0 ? '+' : '') + row.delta : '' }}</td>
            <td class="text-right font-bold">{{ row.score }}</td>
          </tr>
        </tbody>
      </table>
      <details>
        <summary class="btn w-full">🔎 Détail du calcul</summary>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-base">
          <li v-for="step in tarot.detail.score.steps" :key="step">{{ step }}</li>
        </ul>
      </details>
      <template v-if="active">
        <button
          v-if="tarot.actions.next"
          class="btn btn-primary sticky bottom-2 z-10 !min-h-14 text-lg shadow-xl"
          :disabled="busy"
          data-testid="next-round"
          @click="online.send('nextRound')"
        >
          Prêt pour la donne suivante
        </button>
        <p class="muted text-center" role="status">Prêts : {{ tarot.ready.length }} / {{ n }}</p>
        <button
          v-if="view.you.isHost && view.config.tarotEndMode !== 'threshold'"
          class="btn"
          :disabled="busy"
          @click="online.send('tarotFinish')"
        >
          Terminer la partie
        </button>
      </template>
    </section>

    <section
      v-if="active && tarot.hand.length && tarot.phase !== 'summary'"
      aria-label="Votre main"
      class="rounded-2xl bg-stone-200/70 pb-1"
    >
      <p class="px-3 pt-2 text-sm font-semibold text-slate-700">Votre main · {{ tarot.hand.length }} cartes</p>
      <p class="px-3 text-xs font-medium text-slate-700" aria-label="Repères de la main">
        ▶ Jouable · ✓ sélectionnée · × indisponible
      </p>
      <HandFan :items="handItems" label="Cartes de votre main" @tap="tap" />
    </section>
    <div
      v-if="selected.length || (myTurn && tarot.phase === 'playing')"
      class="sticky bottom-2 z-20 flex items-center gap-2 rounded-2xl border border-teal-900 bg-white p-2 shadow-xl"
    >
      <button
        v-if="myTurn && tarot.phase === 'playing'"
        class="btn !min-h-14 !px-3 text-sm"
        type="button"
        data-testid="current-trick"
        @click="trickOpen = true"
      >
        Pli en cours
      </button>
      <button
        v-if="selected.length"
        class="btn min-w-24 !min-h-14"
        type="button"
        data-testid="preview-card"
        @click="previewCard = selected[0]"
      >
        Agrandir
      </button>
      <button
        v-if="myTurn && tarot.phase === 'playing'"
        class="btn btn-primary min-w-0 flex-1 !min-h-14 !px-2 text-sm"
        :disabled="busy || !selected.length"
        data-testid="play-card"
        @click="playSelected"
      >
        {{ busy ? 'Envoi en cours…' : selected.length ? `Jouer ${label(selected[0])}` : 'Choisir une carte' }}
      </button>
    </div>

    <BottomSheet v-if="trickOpen" title="Pli en cours" @close="trickOpen = false">
      <p v-if="tarot.trick.length === 0" class="text-center text-slate-700">Pli vide.</p>
      <ul v-else class="grid grid-cols-2 gap-3" aria-label="Cartes du pli en cours">
        <li v-for="play in tarot.trick" :key="play.seat" class="flex flex-col items-center gap-1">
          <span class="font-semibold">{{ player(play.seat) }}</span>
          <span class="w-24"><PlayingCard :face="faceOfTarot(play.card)" /></span>
        </li>
      </ul>
    </BottomSheet>
    <BottomSheet v-if="previewCard" :title="`Aperçu : ${label(previewCard)}`" @close="previewCard = null">
      <div class="mx-auto w-48 max-w-[70vw]" data-testid="card-preview">
        <PlayingCard :face="faceOfTarot(previewCard)" />
      </div>
      <p class="mt-3 text-center text-lg font-bold">{{ label(previewCard) }}</p>
      <p class="text-center text-sm text-slate-700">Cette carte n’est pas jouée.</p>
    </BottomSheet>

    <p v-if="!active" class="card text-center text-xl font-bold">
      {{ view.status === 'abandoned' ? 'Partie abandonnée' : '🏆 Résultat final' }}
    </p>
    <RouterLink v-if="!active" class="btn btn-primary" to="/en-ligne">Retour aux salons</RouterLink>

    <BottomSheet v-if="scoresOpen" title="Scores" @close="scoresOpen = false">
      <ol class="flex flex-col gap-1.5" aria-label="Classement">
        <li
          v-for="(row, i) in results"
          :key="row.seat"
          class="flex items-baseline justify-between gap-2 rounded-xl bg-white px-3 py-2 shadow-sm"
          :class="row.seat === me ? 'ring-2 ring-gold' : ''"
        >
          <span class="truncate"
            ><span class="text-slate-500">{{ i + 1 }}.</span> {{ row.name }}{{ row.seat === me ? ' (vous)' : '' }}</span
          >
          <span class="font-bold">{{ row.score }} pts</span>
        </li>
      </ol>
      <p class="muted mt-3">Donnes jouées : {{ tarot.completed.length }}</p>
      <button v-if="active && view.you.isHost" class="btn mt-4 w-full" :disabled="busy" @click="abandon">
        Abandonner la partie
      </button>
    </BottomSheet>
    <BottomSheet v-if="lastOpen && tarot.lastTrick" title="Dernier pli" @close="lastOpen = false">
      <p class="mb-3">
        Remporté par <strong>{{ player(tarot.lastTrick.winner) }}</strong
        >.
      </p>
      <ul class="grid grid-cols-4 gap-2">
        <li
          v-for="p in tarot.lastTrick.plays"
          :key="p.seat"
          class="flex flex-col items-center gap-1 text-center text-sm"
        >
          <PlayingCard :face="faceOfTarot(p.card)" :highlight="p.seat === tarot.lastTrick.winner" />
          <span class="w-full truncate">{{ player(p.seat) }}</span>
        </li>
      </ul>
    </BottomSheet>
  </div>
</template>
