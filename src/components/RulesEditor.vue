<script setup lang="ts">
import { TAROT_BONUS_LABELS, TAROT_CONTRACT_LABELS } from '../engine/types'
import type { Rules, TarotBonusType, TarotContract } from '../engine/types'
import Seg from './Seg.vue'

const rules = defineModel<Rules>({ required: true })
const num = (e: Event) => Number((e.target as HTMLInputElement).value)
</script>

<template>
  <div class="flex flex-col gap-3">
    <template v-if="rules.kind !== 'tarot'">
      <Seg
        v-model="rules.rounding" label="Mode de calcul"
        :options="[{ value: 'rounded', label: 'Arrondi à la dizaine' }, { value: 'exact', label: 'Points réels' }]"
      />
      <div>
        <label class="label" for="r-target">Objectif de points</label>
        <input id="r-target" class="input" type="number" inputmode="numeric" min="1" :value="rules.target" @input="rules.target = num($event)" />
      </div>
      <Seg
        v-if="rules.kind === 'belote'" :model-value="rules.announcements ? 'oui' : 'non'" label="Annonces"
        :options="[{ value: 'oui', label: 'Avec annonces' }, { value: 'non', label: 'Sans annonces' }]"
        @update:model-value="(v) => ((rules as any).announcements = v === 'oui')"
      />
      <p class="muted">Égalité à la fin (choix par défaut) : on poursuit avec une donne supplémentaire.</p>
    </template>
    <template v-else>
      <Seg
        v-model="rules.endMode" label="Fin de partie"
        :options="[{ value: 'free', label: 'Arrêt libre' }, { value: 'threshold', label: 'Au seuil' }]"
      />
      <div v-if="rules.endMode === 'threshold'">
        <label class="label" for="r-thr">Seuil (+/−)</label>
        <input id="r-thr" class="input" type="number" inputmode="numeric" min="1" :value="rules.threshold" @input="rules.threshold = num($event)" />
      </div>
      <fieldset>
        <legend class="label">Base des contrats</legend>
        <div class="grid grid-cols-2 gap-2">
          <div v-for="(l, c) in TAROT_CONTRACT_LABELS" :key="c">
            <label class="muted" :for="`b-${c}`">{{ l }}</label>
            <input :id="`b-${c}`" class="input" type="number" inputmode="numeric" min="0" :value="rules.contractBases[c as TarotContract]" @input="rules.contractBases[c as TarotContract] = num($event)" />
          </div>
        </div>
      </fieldset>
      <fieldset>
        <legend class="label">Primes (versées par chaque autre joueur actif)</legend>
        <div class="grid grid-cols-2 gap-2">
          <div v-for="(l, c) in TAROT_BONUS_LABELS" :key="c">
            <label class="muted" :for="`p-${c}`">{{ l }}</label>
            <input :id="`p-${c}`" class="input" type="number" inputmode="numeric" min="0" :value="rules.bonusValues[c as TarotBonusType]" @input="rules.bonusValues[c as TarotBonusType] = num($event)" />
          </div>
        </div>
      </fieldset>
      <div>
        <label class="label" for="r-pc">Petit chelem annoncé réussi : plis concédés au maximum</label>
        <input id="r-pc" class="input" type="number" inputmode="numeric" min="0" :value="rules.petitChelemMaxConceded" @input="rules.petitChelemMaxConceded = num($event)" />
      </div>
    </template>
  </div>
</template>
