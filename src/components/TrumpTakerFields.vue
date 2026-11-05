<script setup lang="ts">
import { computed } from 'vue'
import type { TeamFormBase } from '../forms'
import { parseNum } from '../forms'
import type { Game } from '../engine/model'
import { teamOfPlayer } from '../engine/game'
import { SUIT_LABELS, SUIT_SYMBOLS } from '../engine/types'
import type { Suit } from '../engine/types'
import { useData } from '../stores/data'
import PlayerSelect from './PlayerSelect.vue'
import SegmentedChoice from './SegmentedChoice.vue'

const props = defineProps<{ game: Game; noPoints?: boolean }>()
const f = defineModel<TeamFormBase>({ required: true })
const data = useData()
const team = computed(() => (f.value.takerId ? teamOfPlayer(props.game, f.value.takerId) : null))
const complement = computed(() => {
  const v = parseNum(f.value.points)
  return Number.isInteger(v) && v >= 0 && v <= 162 ? 162 - v : null
})
const tn = (i: 0 | 1) => data.gameTeamName(props.game, i)
</script>

<template>
  <PlayerSelect v-model="f.takerId" label="Joueur preneur" :ids="game.playerIds" />
  <p v-if="team != null" class="ok">Équipe preneuse : {{ tn(team) }}</p>
  <SegmentedChoice
    v-model="f.trump"
    label="Couleur d’atout"
    :options="
      (Object.keys(SUIT_LABELS) as Suit[]).map((s) => ({ value: s, label: `${SUIT_SYMBOLS[s]} ${SUIT_LABELS[s]}` }))
    "
  />
  <slot name="contract" />
  <template v-if="!noPoints">
    <SegmentedChoice
      v-model="f.pointsOf"
      label="Points de plis saisis pour"
      :options="[
        { value: 'taker', label: 'Les preneurs' },
        { value: 'defense', label: 'La défense' },
      ]"
    />
    <div>
      <label class="label" for="pts">Points de plis exacts (dix de der inclus, sans belote ni annonces)</label>
      <input id="pts" v-model="f.points" class="input" inputmode="numeric" placeholder="0 à 162" autocomplete="off" />
      <p v-if="complement != null" class="muted mt-1">
        Complément automatique sur 162 pour l’autre camp : {{ complement }}
      </p>
    </div>
  </template>
  <slot name="after-points" />
  <SegmentedChoice
    v-model="f.beloteTeam"
    label="Belote-rebelote (+20)"
    :options="[
      { value: 'none', label: 'Aucune' },
      { value: '0', label: tn(0) },
      { value: '1', label: tn(1) },
    ]"
  />
</template>
