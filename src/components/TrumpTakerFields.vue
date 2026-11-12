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
const suits = Object.keys(SUIT_LABELS) as Suit[]
const tn = (i: 0 | 1) => data.gameTeamName(props.game, i)
</script>

<template>
  <PlayerSelect v-model="f.takerId" label="Qui a pris ?" :ids="game.playerIds" tiles />
  <p v-if="team != null" class="ok">Équipe preneuse : {{ tn(team) }}</p>
  <fieldset>
    <legend class="label">Couleur d’atout</legend>
    <div class="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Couleur d’atout">
      <button
        v-for="s in suits"
        :key="s"
        type="button"
        role="radio"
        :aria-checked="f.trump === s"
        class="btn !min-h-16 flex-col !gap-0 !px-1"
        :class="f.trump === s ? 'btn-primary !ring-4 !ring-gold' : ''"
        @click="f.trump = s"
      >
        <span
          class="text-3xl leading-none"
          :class="f.trump === s ? 'text-white' : s === 'coeur' || s === 'carreau' ? 'text-suit-red' : ''"
          aria-hidden="true"
          >{{ SUIT_SYMBOLS[s] }}</span
        >
        <span class="text-sm">{{ SUIT_LABELS[s] }}</span>
      </button>
    </div>
  </fieldset>
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
