<script setup lang="ts">
import { computed } from 'vue'
import { ANNOUNCE_LABELS, ANNOUNCE_POINTS, ANNOUNCE_TYPES, announceCount } from '../engine/belote'
import type { AnnounceType } from '../engine/belote'
import type { Game } from '../engine/model'
import type { BeloteForm } from '../forms'
import { useData } from '../stores/data'
import SegmentedChoice from './SegmentedChoice.vue'
import TrumpTakerFields from './TrumpTakerFields.vue'

const props = defineProps<{ game: Game }>()
const f = defineModel<BeloteForm>({ required: true })
const data = useData()
const tn = (i: 0 | 1) => data.gameTeamName(props.game, i)
const withAnnouncements = computed(() => props.game.rules.kind === 'belote' && props.game.rules.announcements)
const both = computed(() => announceCount(f.value.announcements[0]) > 0 && announceCount(f.value.announcements[1]) > 0)
function bump(team: 0 | 1, t: AnnounceType, d: number) {
  const n = Math.max(0, Math.min(4, (f.value.announcements[team][t] ?? 0) + d))
  f.value.announcements[team] = { ...f.value.announcements[team], [t]: n }
}
</script>

<template>
  <TrumpTakerFields v-model="f" :game="game" :no-points="f.capot !== 'none'">
    <template #after-points>
      <SegmentedChoice
        v-model="f.capot"
        label="Capot (tous les plis remportés par une équipe)"
        :options="[
          { value: 'none', label: 'Aucun' },
          { value: '0', label: tn(0) },
          { value: '1', label: tn(1) },
        ]"
      />
      <section v-if="withAnnouncements" class="flex flex-col gap-3" aria-labelledby="ann-h">
        <h3 id="ann-h" class="text-lg font-bold">Annonces</h3>
        <fieldset v-for="team in [0, 1] as const" :key="team" class="rounded-xl border-2 border-slate-300 p-3">
          <legend class="px-1 font-bold">{{ tn(team) }}</legend>
          <div v-for="t in ANNOUNCE_TYPES" :key="t" class="flex items-center justify-between gap-2 py-1">
            <span class="text-base">{{ ANNOUNCE_LABELS[t] }} ({{ ANNOUNCE_POINTS[t] }})</span>
            <span class="flex shrink-0 items-center gap-2">
              <button
                type="button"
                class="btn !min-h-11 !w-11 !px-0"
                :aria-label="`Retirer : ${ANNOUNCE_LABELS[t]}, ${tn(team)}`"
                @click="bump(team, t, -1)"
              >
                −
              </button>
              <output class="w-6 text-center font-bold" :aria-label="`Nombre : ${ANNOUNCE_LABELS[t]}, ${tn(team)}`">{{
                f.announcements[team][t] ?? 0
              }}</output>
              <button
                type="button"
                class="btn !min-h-11 !w-11 !px-0"
                :aria-label="`Ajouter : ${ANNOUNCE_LABELS[t]}, ${tn(team)}`"
                @click="bump(team, t, 1)"
              >
                ＋
              </button>
            </span>
          </div>
        </fieldset>
        <SegmentedChoice
          v-if="both"
          v-model="f.strongest"
          label="Quelle équipe a la plus forte annonce ?"
          :options="[
            { value: '0', label: tn(0) },
            { value: '1', label: tn(1) },
            { value: 'tie', label: 'Égalité' },
          ]"
        />
        <p v-if="both" class="muted">
          Hauteur puis priorité à l’atout : à vous d’indiquer le résultat. L’égalité annule les annonces des deux
          équipes.
        </p>
      </section>
    </template>
  </TrumpTakerFields>
</template>
