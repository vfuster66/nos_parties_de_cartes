<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { RoomView } from '../../../shared/coinche/views'
import type { TarotCard } from '../../../shared/tarot/cards'
import { isTrump } from '../../../shared/tarot/cards'
import type { Suit, TarotBonusType } from '../../engine/types'
import { SUIT_LABELS, SUIT_SYMBOLS, TAROT_BONUS_LABELS, TAROT_CONTRACT_LABELS } from '../../engine/types'
import { askConfirm } from '../../confirm'
import { nameOfSeat } from '../labels'
import { useOnline } from '../store'

const props = defineProps<{ view: RoomView }>()
const online = useOnline()
const tarot = computed(() => props.view.tarot!)
const active = computed(() => props.view.status === 'playing')
const busy = computed(() => !!online.pending)
const selected = ref<TarotCard[]>([])
const announcements = ref<Exclude<TarotBonusType, 'petitAuBout'>[]>([])
watch(
  () => [tarot.value.phase, tarot.value.turn],
  () => {
    selected.value = []
    announcements.value = []
  },
)
function label(card: TarotCard): string {
  if (card === 'excuse') return 'Excuse'
  const [suit, rank] = card.split(':')
  return suit === 'atout' ? `Atout ${rank}` : `${rank} ${SUIT_SYMBOLS[suit as Suit]}`
}
function red(card: TarotCard): boolean {
  return card.startsWith('coeur:') || card.startsWith('carreau:')
}
function toggle(card: TarotCard): void {
  selected.value = selected.value.includes(card)
    ? selected.value.filter((item) => item !== card)
    : [...selected.value, card]
}
const handfulSize = computed(() => {
  const sizes = tarot.value.handfulSizes
  const type = announcements.value.find(
    (item) => item === 'poigneSimple' || item === 'poigneDouble' || item === 'poigneTriple',
  )
  return type ? sizes[type] : 0
})
const canSelect = (card: TarotCard): boolean =>
  tarot.value.actions.discard.includes(card) ||
  (tarot.value.actions.canDeclare && handfulSize.value > 0 && (isTrump(card) || card === 'excuse')) ||
  tarot.value.actions.playable.includes(card)

const announce = () =>
  online.send('tarotDeclare', { types: announcements.value, shown: handfulSize.value ? selected.value : [] })
const sortedHand = computed(() =>
  [...tarot.value.hand].sort((a, b) => {
    const suits = ['atout', 'excuse', 'pique', 'coeur', 'trefle', 'carreau']
    const [aSuit, aRank] = a.split(':')
    const [bSuit, bRank] = b.split(':')
    const rank = (r: string) => ({ V: 11, C: 12, D: 13, R: 14 })[r] ?? Number(r)
    return suits.indexOf(aSuit) - suits.indexOf(bSuit) || rank(bRank) - rank(aRank)
  }),
)
const player = (seat: 0 | 1 | 2 | 3) => nameOfSeat(props.view, seat)
const results = computed(() =>
  tarot.value.totals
    .map((score, seat) => ({
      name: player(seat as 0 | 1 | 2 | 3),
      score,
      delta: tarot.value.detail?.score.delta[seat],
    }))
    .sort((a, b) => b.score - a.score),
)
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
  <main class="flex flex-col gap-3" data-testid="tarot-table">
    <h1 class="text-xl font-bold">Tarot à {{ view.seats.length === 3 ? 'trois' : 'quatre' }}</h1>
    <p v-if="view.pause" class="note" role="status">{{ view.pause.reason }}</p>
    <p v-if="online.error" class="err" role="alert">{{ online.error }}</p>
    <section class="card flex flex-col gap-2">
      <p v-if="!active" class="font-bold">{{ view.status === 'abandoned' ? 'Partie abandonnée' : 'Résultat final' }}</p>
      <p v-if="tarot.contract && tarot.taker !== null">
        {{ TAROT_CONTRACT_LABELS[tarot.contract] }} · {{ player(tarot.taker) }}
      </p>
      <p v-if="active && tarot.phase !== 'summary'">
        Au tour de <strong>{{ player(tarot.turn) }}</strong>
      </p>
      <ul aria-label="Scores">
        <li v-for="(row, i) in results" :key="i">
          {{ row.name }} · {{ row.score }} pts
          <template v-if="row.delta !== undefined"
            >({{ row.delta > 0 ? '+' : '' }}{{ row.delta }} à cette donne)</template
          >
        </li>
      </ul>
    </section>
    <section v-if="active && tarot.phase === 'bidding'" class="card flex flex-col gap-2">
      <h2 class="font-bold">Enchères</h2>
      <ul>
        <li v-for="bid in tarot.bids" :key="bid.seat">
          {{ player(bid.seat) }} · {{ bid.contract ? TAROT_CONTRACT_LABELS[bid.contract] : 'Passe' }}
        </li>
      </ul>
      <button
        v-for="contract in tarot.actions.bids"
        :key="contract"
        class="btn"
        :disabled="busy"
        @click="online.send('tarotBid', { contract })"
      >
        {{ TAROT_CONTRACT_LABELS[contract] }}
      </button>
      <button v-if="tarot.actions.canPass" class="btn" :disabled="busy" @click="online.send('pass')">Passer</button>
    </section>
    <section v-if="active && tarot.phase === 'discard'" class="card">
      <h2 class="font-bold">Chien et écart</h2>
      <p>Chien · {{ tarot.dog.map(label).join(' · ') }}</p>
      <button
        v-if="tarot.actions.discard.length"
        class="btn"
        :disabled="selected.length !== 6 || busy"
        @click="online.send('tarotDiscard', { cards: selected })"
      >
        Valider l’écart ({{ selected.length }}/6)
      </button>
    </section>
    <section v-if="active && tarot.actions.canDeclare" class="card flex flex-col gap-2">
      <h2 class="font-bold">Annonces</h2>
      <label v-for="type in tarot.actions.declarations" :key="type" class="flex items-center gap-2">
        <input v-model="announcements" type="checkbox" :value="type" />
        {{ TAROT_BONUS_LABELS[type] }}
      </label>
      <p v-if="handfulSize">Choisis {{ handfulSize }} cartes de ta poignée dans ta main.</p>
      <button class="btn" :disabled="busy || (handfulSize > 0 && selected.length !== handfulSize)" @click="announce">
        {{ announcements.length ? 'Valider les annonces' : 'Continuer sans annonce' }}
      </button>
    </section>
    <section v-if="active && (tarot.phase === 'declare' || tarot.phase === 'playing')" class="card">
      <p v-if="tarot.shownDiscard.length">Atouts écartés · {{ tarot.shownDiscard.map(label).join(' · ') }}</p>
      <ul>
        <li v-for="entry in tarot.declarations.filter((item) => item.types.length)" :key="entry.seat">
          {{ player(entry.seat) }} · {{ entry.types.map((type) => TAROT_BONUS_LABELS[type]).join(', ') }}
          <span v-if="entry.shown.length">({{ entry.shown.map(label).join(' · ') }})</span>
        </li>
      </ul>
      <template v-if="tarot.phase === 'playing'">
        <h2 class="font-bold">Pli {{ tarot.trickCount + 1 }}/{{ tarot.trickLimit }}</h2>
        <ul>
          <li v-for="play in tarot.trick" :key="play.seat">{{ player(play.seat) }} · {{ label(play.card) }}</li>
        </ul>
        <details v-if="tarot.lastTrick">
          <summary>Dernier pli · {{ player(tarot.lastTrick.winner) }}</summary>
          <ul>
            <li v-for="play in tarot.lastTrick.plays" :key="play.seat">
              {{ player(play.seat) }} · {{ label(play.card) }}
            </li>
          </ul>
        </details>
      </template>
    </section>
    <section v-if="active && tarot.hand.length" class="card">
      <h2 class="font-bold">Ta main</h2>
      <div class="mt-2 grid grid-cols-4 gap-1">
        <button
          v-for="card in sortedHand"
          :key="card"
          class="btn !px-1"
          :class="{ 'btn-primary': selected.includes(card), '!text-red-700': red(card) && !selected.includes(card) }"
          :aria-pressed="selected.includes(card)"
          :title="card.includes(':') && !isTrump(card) ? SUIT_LABELS[card.split(':')[0] as Suit] : label(card)"
          :disabled="busy || !canSelect(card)"
          @click="tarot.phase === 'playing' ? online.send('tarotPlay', { card }) : toggle(card)"
        >
          {{ label(card) }}
        </button>
      </div>
    </section>
    <section v-if="tarot.detail" class="card flex flex-col gap-2">
      <h2 class="font-bold">Résultat de la donne</h2>
      <p>
        {{ tarot.detail.points }} points · {{ tarot.detail.bouts }} bout(s) ·
        {{ tarot.detail.score.outcome === 'success' ? 'Contrat réussi' : 'Contrat chuté' }}
      </p>
      <details>
        <summary>Détail du calcul</summary>
        <ul>
          <li v-for="step in tarot.detail.score.steps" :key="step">{{ step }}</li>
        </ul>
      </details>
      <button v-if="tarot.actions.next" class="btn btn-primary" :disabled="busy" @click="online.send('nextRound')">
        Prêt pour la prochaine donne
      </button>
      <p v-if="active">Prêts · {{ tarot.ready.length }}/{{ view.seats.length }}</p>
      <button
        v-if="active && view.you.isHost && view.config.tarotEndMode !== 'threshold'"
        class="btn"
        :disabled="busy"
        @click="online.send('tarotFinish')"
      >
        Terminer la partie
      </button>
    </section>
    <button v-if="active && view.you.isHost" class="btn" :disabled="busy" @click="abandon">Abandonner</button>
    <RouterLink v-if="!active" class="btn" to="/en-ligne">Retour aux salons</RouterLink>
  </main>
</template>
