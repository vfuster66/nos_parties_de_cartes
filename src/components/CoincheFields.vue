<script setup lang="ts">
import { computed } from 'vue'
import { teamOfPlayer } from '../engine/game'
import type { Game } from '../engine/model'
import type { CoincheForm } from '../forms'
import { useData } from '../stores/data'
import PlayerSelect from './PlayerSelect.vue'
import Seg from './Seg.vue'
import TrumpTakerFields from './TrumpTakerFields.vue'

const props = defineProps<{ game: Game }>()
const f = defineModel<CoincheForm>({ required: true })
const data = useData()
const takerTeam = computed(() => (f.value.takerId ? teamOfPlayer(props.game, f.value.takerId) : null))
const defenders = computed(() => (takerTeam.value == null ? [] : props.game.playerIds.filter((p) => teamOfPlayer(props.game, p) !== takerTeam.value)))
const contracts = [80, 90, 100, 110, 120, 130, 140, 150, 160]
const tn = (i: 0 | 1) => data.gameTeamName(props.game, i)
function setLevel(l: CoincheForm['level']) {
  f.value.level = l
  if (l === 'none') { f.value.coincheTeam = ''; f.value.coincherId = '' }
  else if (takerTeam.value != null && f.value.coincheTeam === '') f.value.coincheTeam = String(1 - takerTeam.value) as '0' | '1'
}
</script>

<template>
  <TrumpTakerFields v-model="f" :game="game" :no-points="f.allTricks">
    <template #contract>
      <Seg v-model="f.contractMode" label="Type de contrat" :options="[{ value: 'num', label: 'Contrat numérique' }, { value: 'capot', label: 'Capot annoncé' }]" />
      <div v-if="f.contractMode === 'num'">
        <label class="label" for="ctr">Contrat (80 à 160, par 10)</label>
        <select id="ctr" v-model="f.contract" class="input"><option v-for="c in contracts" :key="c" :value="String(c)">{{ c }}</option></select>
      </div>
      <Seg
        :model-value="f.level" label="Coinche" :options="[{ value: 'none', label: 'Normal ×1' }, { value: 'coinche', label: 'Coinché ×2' }, { value: 'surcoinche', label: 'Surcoinché ×3' }]"
        @update:model-value="setLevel"
      />
      <template v-if="f.level !== 'none'">
        <Seg v-model="f.coincheTeam" label="Équipe ayant coinché" :options="[{ value: '0', label: tn(0) }, { value: '1', label: tn(1) }]" />
        <PlayerSelect v-model="f.coincherId" label="Joueur ayant coinché (facultatif)" :ids="defenders.length ? defenders : game.playerIds" placeholder="— Non renseigné —" />
      </template>
    </template>
    <template #after-points>
      <label class="flex min-h-12 items-center gap-3 rounded-xl border-2 border-slate-300 p-3">
        <input v-model="f.allTricks" type="checkbox" class="h-6 w-6" />
        <span>Capot réalisé : les preneurs ont remporté tous les plis (la saisie des points est alors ignorée)</span>
      </label>
    </template>
  </TrumpTakerFields>
</template>
