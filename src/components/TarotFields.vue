<script setup lang="ts">
import { computed, ref } from 'vue'
import { TAROT_TARGETS, gapFromPoints } from '../engine/tarot'
import { TAROT_BONUS_LABELS, TAROT_CONTRACT_LABELS } from '../engine/types'
import type { TarotBonusType, TarotContract } from '../engine/types'
import { parseNum } from '../forms'
import type { TarotForm } from '../forms'
import PlayerSelect from './PlayerSelect.vue'
import SegmentedChoice from './SegmentedChoice.vue'

const props = defineProps<{ active: string[] }>()
const f = defineModel<TarotForm>({ required: true })
const bouts = ref<0 | 1 | 2 | 3>(1)
const helperPts = ref('')
const isFive = computed(() => props.active.length === 5)
const others = computed(() => props.active.filter((p) => p !== f.value.takerId))
function applyHelper() {
  const v = parseNum(helperPts.value)
  if (!Number.isFinite(v) || v < 0 || v > 91 || !Number.isInteger(v * 2)) return
  const r = gapFromPoints(v, bouts.value)
  f.value.gap = String(r.gap)
  f.value.success = r.success ? 'success' : 'fail'
}
function addBonus() {
  f.value.bonuses.push({ type: 'petitAuBout', playerId: '', tricksConceded: '0' })
}
const isChelem = (t: TarotBonusType) => t === 'petitChelem' || t === 'grandChelem'
</script>

<template>
  <PlayerSelect v-model="f.takerId" label="Joueur preneur" :ids="active" />
  <SegmentedChoice
    v-model="f.contract"
    label="Contrat"
    :options="
      (Object.keys(TAROT_CONTRACT_LABELS) as TarotContract[]).map((c) => ({
        value: c,
        label: TAROT_CONTRACT_LABELS[c],
      }))
    "
  />
  <template v-if="isFive">
    <SegmentedChoice
      v-model="f.callMode"
      label="Appel au roi"
      :options="[
        { value: 'partner', label: 'Appelle un partenaire' },
        { value: 'self_call', label: 'Le preneur s’appelle' },
        { value: 'king_in_dog', label: 'Roi au chien' },
      ]"
    />
    <PlayerSelect
      v-if="f.callMode === 'partner'"
      v-model="f.calledId"
      label="Joueur appelé (détenteur du roi)"
      :ids="others"
    />
    <p v-else class="muted">
      Le preneur joue seul : motif « {{ f.callMode === 'self_call' ? 's’appelle' : 'roi au chien' }} ».
    </p>
  </template>

  <div>
    <label class="label" for="gap">Écart exact (par pas de 0,5)</label>
    <input id="gap" v-model="f.gap" class="input" inputmode="decimal" placeholder="Ex. 5,5" autocomplete="off" />
  </div>
  <SegmentedChoice
    v-model="f.success"
    label="Contrat"
    :options="[
      { value: 'success', label: 'Réussi' },
      { value: 'fail', label: 'Chuté' },
    ]"
  />
  <p class="muted">Un écart nul est toujours réussi. La réussite se juge sur l’écart exact, avant arrondi.</p>

  <details class="rounded-xl border-2 border-slate-300 p-3">
    <summary class="cursor-pointer font-bold">Aide : calculer l’écart avec les points</summary>
    <div class="mt-2 flex flex-col gap-2">
      <SegmentedChoice
        v-model="bouts"
        label="Nombre de bouts du preneur"
        :options="[0, 1, 2, 3].map((n) => ({ value: n as 0 | 1 | 2 | 3, label: `${n} (${TAROT_TARGETS[n]})` }))"
      />
      <label class="label" for="hp">Points du preneur (sur 91)</label>
      <input id="hp" v-model="helperPts" class="input" inputmode="decimal" />
      <button type="button" class="btn" @click="applyHelper">Calculer l’écart</button>
    </div>
  </details>

  <section aria-labelledby="bon-h" class="flex flex-col gap-2">
    <h3 id="bon-h" class="text-lg font-bold">Primes individuelles</h3>
    <div v-for="(b, i) in f.bonuses" :key="i" class="flex flex-col gap-2 rounded-xl border-2 border-slate-300 p-3">
      <div>
        <label class="label" :for="`bt-${i}`">Prime {{ i + 1 }}</label>
        <select :id="`bt-${i}`" v-model="b.type" class="input">
          <option v-for="(l, k) in TAROT_BONUS_LABELS" :key="k" :value="k">{{ l }}</option>
        </select>
      </div>
      <PlayerSelect v-model="b.playerId" label="Bénéficiaire" :ids="active" />
      <div v-if="isChelem(b.type)">
        <label class="label" :for="`bc-${i}`">Plis concédés par le camp</label>
        <input :id="`bc-${i}`" v-model="b.tricksConceded" class="input" inputmode="numeric" />
      </div>
      <button type="button" class="btn" @click="f.bonuses.splice(i, 1)">Retirer cette prime</button>
    </div>
    <button type="button" class="btn" @click="addBonus">＋ Ajouter une prime</button>
  </section>
</template>
