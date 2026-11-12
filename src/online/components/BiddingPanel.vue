<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { SUITS } from '../../../shared/coinche/cards'
import type { Suit } from '../../../shared/coinche/cards'
import type { RoomView } from '../../../shared/coinche/views'
import { askConfirm } from '../../confirm'
import { SUIT_LABELS, SUIT_SYMBOLS } from '../../engine/types'
import { contractText, levelText, nameOfSeat, suitText } from '../labels'
import { useOnline } from '../store'

const props = defineProps<{ view: RoomView }>()
const online = useOnline()
const a = computed(() => props.view.actions)
const round = computed(() => props.view.round!)
const secondPass = computed(() => round.value.beloteDeal?.pass === 2)
const SUIT_BUTTON_ORDER: readonly Suit[] = ['carreau', 'coeur', 'pique', 'trefle']
// Au second tour, les quatre couleurs restent visibles ; celle déjà proposée au premier tour est désactivée.
const takeOptions = computed(() => (secondPass.value ? SUIT_BUTTON_ORDER : a.value.takeSuits))
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
const partnerRaises = computed(() => {
  const contract = round.value.contract
  const bid = a.value.bid
  const seat = props.view.you.seat
  if (
    !contract ||
    typeof contract.value !== 'number' ||
    !bid ||
    seat == null ||
    contract.seat === seat ||
    contract.seat % 2 !== seat % 2
  )
    return []
  const currentValue = contract.value
  return [10, 20].filter((raise) => currentValue + raise <= bid.max)
})

async function quickRaise(raise: number): Promise<void> {
  const contract = round.value.contract
  if (!contract || typeof contract.value !== 'number' || busy.value) return
  await online.send('bid', { value: contract.value + raise, suit: contract.suit })
}

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
  <section
    class="card flex flex-col gap-2 !border-teal-700 !border-2 !p-2"
    aria-labelledby="bid-title"
    data-testid="bidding"
  >
    <h2 id="bid-title" class="eyebrow">
      {{ round.beloteDeal ? (secondPass ? '2e tour · atout' : '1er tour · atout') : 'Enchères' }}
    </h2>
    <p v-if="!round.beloteDeal && round.contract" class="font-semibold" data-testid="current-contract">
      Contrat : {{ contractText(round.contract) }} par {{ nameOfSeat(view, round.contract.seat) }}
    </p>

    <p v-if="!myTurn && !view.pause" class="rounded-lg bg-stone-200 px-2 py-1 text-center text-sm" role="status">
      ▶ Au tour de <strong>{{ turnName }}</strong>
    </p>

    <template v-if="myTurn && !view.pause">
      <p v-if="!round.beloteDeal" class="rounded-xl bg-teal-700 p-2.5 text-center font-bold text-white" role="status">
        À vous
      </p>
      <div v-if="round.beloteDeal" class="flex flex-col gap-1.5" data-testid="belote-take-options">
        <div
          :class="secondPass ? 'grid grid-cols-4 gap-2' : 'grid grid-cols-1 gap-2'"
          role="group"
          aria-label="Couleur d’atout"
        >
          <button
            v-for="candidate in takeOptions"
            :key="candidate"
            class="btn relative"
            :class="[
              secondPass ? '!min-h-12 !px-1 !text-3xl' : 'btn-primary !min-h-12',
              secondPass && (candidate === 'coeur' || candidate === 'carreau') ? '!text-suit-red' : '',
              secondPass && candidate !== 'coeur' && candidate !== 'carreau' ? '!text-suit-black' : '',
              secondPass && !a.takeSuits.includes(candidate) ? 'disabled:!bg-stone-100 disabled:!opacity-50' : '',
            ]"
            :disabled="busy || !a.takeSuits.includes(candidate)"
            :aria-label="`Prendre à ${suitText(candidate)}${a.takeSuits.includes(candidate) ? '' : ', indisponible au deuxième tour'}`"
            :title="
              a.takeSuits.includes(candidate)
                ? `Prendre à ${suitText(candidate)}`
                : 'Couleur déjà proposée au premier tour'
            "
            @click="online.send('take', { suit: candidate })"
          >
            <span aria-hidden="true">{{ SUIT_SYMBOLS[candidate] }}</span>
            <span v-if="!secondPass">Prendre</span>
            <span
              v-if="secondPass && !a.takeSuits.includes(candidate)"
              class="absolute right-1 top-0 text-base font-black text-slate-900"
              aria-hidden="true"
              >×</span
            >
          </button>
        </div>
        <button
          v-if="a.canPass"
          class="btn !min-h-12 w-full"
          :disabled="busy"
          data-testid="pass"
          @click="online.send('pass')"
        >
          Passer
        </button>
      </div>
      <div v-if="a.bid">
        <div
          v-if="partnerRaises.length"
          class="mb-2 flex items-center gap-2"
          role="group"
          aria-label="Relances rapides"
        >
          <span class="text-sm font-semibold">{{ SUIT_SYMBOLS[round.contract!.suit] }}</span>
          <button
            v-for="raise in partnerRaises"
            :key="raise"
            class="btn !min-h-10 flex-1"
            :disabled="busy"
            :aria-label="`Relancer de ${raise} dans ${suitText(round.contract!.suit)}`"
            :title="
              raise === 10 ? 'Atout fort (valet ou neuf) ou un as' : 'Deux as, ou un as avec valet ou neuf d’atout'
            "
            @click="quickRaise(raise)"
          >
            +{{ raise }}
          </button>
        </div>
        <p class="label">Valeur</p>
        <div class="grid grid-cols-5 gap-1.5" role="group" aria-label="Valeur du contrat">
          <button
            v-for="v in values"
            :key="v"
            class="btn !px-0"
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
            class="btn !min-h-14 !text-3xl"
            :class="[
              suit === s ? 'btn-primary !ring-4 !ring-gold' : '',
              s === 'coeur' || s === 'carreau' ? '!text-suit-red' : '',
            ]"
            :aria-pressed="suit === s"
            :aria-label="SUIT_LABELS[s]"
            :disabled="busy"
            data-testid="bid-suit"
            @click="suit = s"
          >
            <span :class="suit === s ? '!text-white' : ''">{{ SUIT_SYMBOLS[s] }}</span
            ><span class="sr-only">{{ SUIT_LABELS[s] }}</span>
          </button>
        </div>
        <button
          class="btn btn-primary mt-3 w-full !min-h-14"
          :disabled="!canBid"
          data-testid="bid-confirm"
          @click="announce"
        >
          {{ value && suit ? `Annoncer ${value} ${SUIT_SYMBOLS[suit]}` : 'Valeur + atout' }}
        </button>
      </div>
      <div v-if="!round.beloteDeal" class="grid grid-cols-2 gap-2">
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
        Couleur obligatoire · aucune sélection automatique.
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
