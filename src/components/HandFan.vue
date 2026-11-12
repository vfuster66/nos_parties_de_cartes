<script setup lang="ts">
// Main du joueur : grille serrée dont le nombre de colonnes dépend du nombre de cartes,
// pour qu'une main de 24 cartes reste lisible et jouable en portrait (3 lignes de 8) sans défilement latéral.
import { computed } from 'vue'
import PlayingCard from './PlayingCard.vue'
import type { Face } from '../cardface'

export interface HandItem {
  key: string
  face: Face
  state: 'normal' | 'playable' | 'blocked' | 'selected' | 'pending'
  /** Libellé accessible complet, état compris. */
  label: string
  disabled?: boolean
  pressed?: boolean
}
const props = defineProps<{ items: HandItem[]; label: string; compact?: boolean; simpleFigures?: boolean }>()
const emit = defineEmits<{ tap: [key: string] }>()
const cols = computed(() => {
  const n = props.items.length
  // Une main de 24 cartes passe sur quatre rangées de six : cartes plus larges,
  // cibles tactiles séparées et indices lisibles sur les petits écrans.
  return props.compact ? Math.min(Math.max(n, 1), 5) : n <= 8 ? 4 : n <= 24 ? 6 : 8
})
const maxCard = computed(() =>
  props.compact ? '3.8rem' : cols.value === 4 ? '4.75rem' : props.items.length > 12 ? '2.85rem' : '4rem',
)
</script>

<template>
  <ul
    class="mx-auto grid justify-center gap-y-2 pb-1 pt-2"
    :class="compact ? 'gap-x-1 px-0' : items.length > 12 ? 'gap-x-1 px-1' : 'gap-x-1.5 px-1'"
    :style="{ gridTemplateColumns: `repeat(${cols}, minmax(0, ${maxCard}))` }"
    :aria-label="label"
  >
    <li v-for="it in items" :key="it.key">
      <button
        type="button"
        class="block w-full touch-manipulation rounded-lg p-0 transition-transform motion-reduce:transition-none"
        :class="[
          it.state === 'selected' || it.state === 'pending'
            ? '-translate-y-2.5'
            : it.state === 'playable'
              ? '-translate-y-1'
              : '',
        ]"
        :aria-label="it.label"
        :aria-pressed="it.pressed ?? false"
        :disabled="it.disabled"
        data-testid="hand-card"
        :data-card="it.key"
        :data-state="it.state"
        @click="emit('tap', it.key)"
      >
        <PlayingCard :face="it.face" :state="it.state" :simple-figures="simpleFigures" />
      </button>
    </li>
  </ul>
</template>
