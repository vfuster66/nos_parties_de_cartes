<script setup lang="ts">
import { computed } from 'vue'
import type { RoomView, RoundRecordView } from '../../../shared/coinche/views'
import { signed } from '../../labels'
import { contractText, levelText, nameOfSeat, teamName } from '../labels'
import { useOnline } from '../store'

const props = defineProps<{ view: RoomView; record: RoundRecordView }>()
const online = useOnline()
const r = computed(() => props.record)
const d = computed(() => r.value.detail!)
const outcome = computed(() =>
  d.value.outcome === 'capot'
    ? '★ Capot réalisé'
    : d.value.outcome === 'success'
      ? '✓ Contrat réussi'
      : d.value.outcome === 'litige'
        ? 'Litige'
        : '✗ Contrat chuté',
)
const rounding = computed(() => (props.view.config.rounding === 'rounded' ? 'arrondi à la dizaine' : 'points réels'))
const readySeats = computed(() => props.view.round!.readyForNext)
const finished = computed(() => props.view.status === 'finished')
</script>

<template>
  <section class="card flex flex-col gap-3" aria-labelledby="sum-title" data-testid="round-summary">
    <h2 id="sum-title" class="text-xl font-bold">Résultat de la donne {{ r.index + 1 }}</h2>
    <p class="text-lg font-semibold" data-testid="outcome">{{ outcome }}</p>
    <dl class="grid grid-cols-2 gap-x-3 gap-y-1">
      <dt class="muted">{{ r.contract?.value === 'prise' ? 'Atout et preneur' : 'Contrat' }}</dt>
      <dd>
        {{ contractText(r.contract) }} — {{ nameOfSeat(view, r.contract!.seat) }} ({{ teamName(view, r.takerTeam!) }})
        <span v-if="r.level !== 'none'" class="font-semibold">{{ levelText(r.level) }}</span>
      </dd>
      <dt class="muted">Plis</dt>
      <dd>{{ r.trickCounts[0] }} / {{ r.trickCounts[1] }}</dd>
      <dt class="muted">Points de plis</dt>
      <dd>{{ r.trickPoints[0] }} / {{ r.trickPoints[1] }}</dd>
      <dt class="muted">Belote</dt>
      <dd>{{ r.beloteTeam == null ? 'aucune' : teamName(view, r.beloteTeam) + ' (+20)' }}</dd>
      <dt class="muted">Calcul</dt>
      <dd>
        {{ rounding }}<template v-if="r.contract?.value !== 'prise'">, multiplicateur ×{{ d.multiplier }}</template>
      </dd>
    </dl>
    <table class="w-full text-center" aria-label="Points de la donne">
      <thead>
        <tr>
          <th scope="col" class="text-left"></th>
          <th scope="col">{{ teamName(view, 0) }}</th>
          <th scope="col">{{ teamName(view, 1) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row" class="text-left">Plis retenus</th>
          <td>{{ d.teams[0].retainedPlis }}</td>
          <td>{{ d.teams[1].retainedPlis }}</td>
        </tr>
        <tr class="font-bold" data-testid="delta">
          <th scope="row" class="text-left">Points ajoutés</th>
          <td>{{ signed(r.delta[0]) }}</td>
          <td>{{ signed(r.delta[1]) }}</td>
        </tr>
        <tr class="text-xl font-bold" data-testid="totals">
          <th scope="row" class="text-left">Totaux</th>
          <td>{{ r.totalsAfter[0] }}</td>
          <td>{{ r.totalsAfter[1] }}</td>
        </tr>
      </tbody>
    </table>
    <details>
      <summary class="btn w-full">Détail du calcul</summary>
      <ul class="mt-2 list-disc space-y-1 pl-5 text-base">
        <li v-for="(s, i) in d.steps" :key="i">{{ s }}</li>
      </ul>
    </details>
    <template v-if="!finished">
      <button
        v-if="view.actions.canReadyNext"
        class="btn btn-primary !min-h-14"
        :disabled="!!online.pending || !!view.pause"
        data-testid="next-round"
        @click="online.send('nextRound')"
      >
        Prêt pour la donne suivante
      </button>
      <p class="muted" role="status">
        Prêts : {{ readySeats.length }} / 4
        <template v-if="readySeats.length">({{ readySeats.map((s) => nameOfSeat(view, s)).join(', ') }})</template>
      </p>
    </template>
  </section>
</template>
