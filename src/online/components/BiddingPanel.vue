<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { SUITS } from '../../../shared/coinche/cards'
import type { Suit } from '../../../shared/coinche/cards'
import type { RoomView } from '../../../shared/coinche/views'
import { askConfirm } from '../../confirm'
import { SUIT_LABELS, SUIT_SYMBOLS } from '../../engine/types'
import { bidText, cardName, contractText, levelText, nameOfSeat, suitText } from '../labels'
import { useOnline } from '../store'

const props = defineProps<{ view: RoomView }>()
const online = useOnline()
const a = computed(() => props.view.actions)
const round = computed(() => props.view.round!)
const values = computed(() => {
  const b = a.value.bid
  if (!b) return []
  const out: number[] = []
  for (let v = b.min; v <= b.max; v += b.step) out.push(v)
  return out
})
const value = ref<number | null>(null)
const suit = ref<Suit | null>(null)
const capotOpen = ref(false)
const capotSuit = ref<Suit | null>(null)

// Une sélection devenue invalide (le contrat a monté) est remise à zéro.
watch(values, (vs) => {
  if (value.value != null && !vs.includes(value.value)) value.value = null
})
watch(
  () => props.view.version,
  () => {
    if (!a.value.capot) capotOpen.value = false
  },
)
const busy = computed(() => !!online.pending)
const myTurn = computed(() => round.value.turn === props.view.you.seat)
const canBid = computed(() => value.value != null && suit.value != null && !busy.value)

async function announce(): Promise<void> {
  if (value.value == null || !suit.value) return
  if (await online.send('bid', { value: value.value, suit: suit.value })) {
    value.value = null
    suit.value = null
  }
}
async function confirmCapot(): Promise<void> {
  if (!capotSuit.value) return
  if (await online.send('capot', { suit: capotSuit.value })) {
    capotOpen.value = false
    capotSuit.value = null
  }
}
async function coinche(): Promise<void> {
  const ref_ = a.value.coinche
  if (!ref_) return
  const ok = await askConfirm({
    title: 'Coincher ?',
    message: `Coincher le contrat ${contractText(round.value.contract)} de ${nameOfSeat(props.view, round.value.contract!.seat)} ? Les enchères s'arrêtent aussitôt.`,
    confirmLabel: 'Coincher',
  })
  if (ok) await online.send('coinche', { contractRef: ref_.contractRef })
}
const turnName = computed(() => (round.value.turn == null ? '' : nameOfSeat(props.view, round.value.turn)))
</script>

<template>
  <section class="card flex flex-col gap-3" aria-labelledby="bid-title" data-testid="bidding">
    <h2 id="bid-title" class="text-lg font-bold">{{ round.beloteDeal ? 'Prise d’atout' : 'Enchères' }}</h2>
    <p v-if="round.beloteDeal">
      Carte retournée : {{ cardName(round.beloteDeal.turned) }} · Tour {{ round.beloteDeal.pass }}/2
    </p>
    <p v-else-if="round.contract" class="font-semibold" data-testid="current-contract">
      Contrat : {{ contractText(round.contract) }} par {{ nameOfSeat(view, round.contract.seat) }}
    </p>
    <p v-else class="muted">Aucune enchère pour l’instant.</p>
    <ol
      v-if="round.bids.length"
      class="muted flex flex-wrap gap-x-3 gap-y-1 text-sm"
      aria-label="Historique des enchères"
    >
      <li v-for="(b, i) in round.bids" :key="i">{{ bidText(view, b) }}</li>
    </ol>

    <p v-if="!myTurn && !view.pause" class="rounded-lg bg-slate-100 p-2" role="status">
      Au tour de <strong>{{ turnName }}</strong> de parler.
    </p>

    <template v-if="myTurn && !view.pause">
      <p class="font-semibold text-teal-900" role="status">C’est à vous de parler.</p>
      <button
        v-for="candidate in a.takeSuits"
        :key="candidate"
        class="btn btn-primary"
        :disabled="busy"
        @click="online.send('take', { suit: candidate })"
      >
        Prendre à {{ suitText(candidate) }}
      </button>
      <div v-if="a.bid">
        <p class="label">Valeur</p>
        <div class="grid grid-cols-3 gap-2" role="group" aria-label="Valeur du contrat">
          <button
            v-for="v in values"
            :key="v"
            class="btn"
            :class="value === v ? 'btn-primary' : ''"
            :aria-pressed="value === v"
            :disabled="busy"
            data-testid="bid-value"
            @click="value = v"
          >
            {{ v }}
          </button>
        </div>
        <p class="label mt-3">Couleur d’atout</p>
        <div class="grid grid-cols-4 gap-2" role="group" aria-label="Couleur d'atout">
          <button
            v-for="s in SUITS"
            :key="s"
            class="btn !text-2xl"
            :class="[suit === s ? 'btn-primary' : '', s === 'coeur' || s === 'carreau' ? '!text-red-700' : '']"
            :aria-pressed="suit === s"
            :aria-label="SUIT_LABELS[s]"
            :disabled="busy"
            data-testid="bid-suit"
            @click="suit = s"
          >
            <span :class="suit === s ? '!text-white' : ''">{{ SUIT_SYMBOLS[s] }}</span>
          </button>
        </div>
        <button
          class="btn btn-primary mt-3 w-full !min-h-14"
          :disabled="!canBid"
          data-testid="bid-confirm"
          @click="announce"
        >
          {{ value && suit ? `Annoncer ${value} ${SUIT_SYMBOLS[suit]}` : 'Choisissez une valeur et une couleur' }}
        </button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button v-if="a.canPass" class="btn !min-h-14" :disabled="busy" data-testid="pass" @click="online.send('pass')">
          Passer
        </button>
        <button
          v-if="a.capot"
          class="btn !min-h-14"
          :disabled="busy"
          data-testid="capot-open"
          @click="capotOpen = true"
        >
          Annoncer capot
        </button>
      </div>
    </template>

    <div v-if="capotOpen && a.capot" class="note" role="group" aria-labelledby="capot-title" data-testid="capot-dialog">
      <p id="capot-title" class="font-bold">Capot : quelle couleur d’atout ?</p>
      <p class="mb-2 text-sm">
        <template v-if="a.capot.suggestedSuits.length">
          Couleurs déjà annoncées par votre équipe : {{ a.capot.suggestedSuits.map((s) => suitText(s)).join(', ') }}.
        </template>
        Choisissez explicitement la couleur : aucune n’est retenue à votre place.
      </p>
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="s in SUITS"
          :key="s"
          class="btn !text-2xl"
          :class="[capotSuit === s ? 'btn-primary' : '', a.capot.suggestedSuits.includes(s) ? '!border-amber-600' : '']"
          :aria-pressed="capotSuit === s"
          :aria-label="SUIT_LABELS[s]"
          data-testid="capot-suit"
          @click="capotSuit = s"
        >
          {{ SUIT_SYMBOLS[s] }}
        </button>
      </div>
      <div class="mt-2 grid grid-cols-2 gap-2">
        <button class="btn btn-danger" :disabled="!capotSuit || busy" data-testid="capot-confirm" @click="confirmCapot">
          {{ capotSuit ? `Confirmer : capot à ${suitText(capotSuit)}` : 'Choisissez une couleur' }}
        </button>
        <button class="btn" @click="capotOpen = false">Annuler</button>
      </div>
    </div>

    <button
      v-if="a.coinche && !view.pause"
      class="btn btn-danger !min-h-14"
      :disabled="busy"
      data-testid="coinche"
      @click="coinche"
    >
      Coincher {{ contractText(round.contract) }}
    </button>
    <p v-if="round.level !== 'none'" class="font-semibold">Contrat {{ levelText(round.level) }}</p>
  </section>
</template>
