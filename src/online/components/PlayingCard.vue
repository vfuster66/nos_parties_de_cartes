<script setup lang="ts">
import { computed } from 'vue'
import type { Card } from '../../../shared/coinche/cards'
import { SUIT_SYMBOLS } from '../../engine/types'
import { cardName, isRed, RANK_SHORT } from '../labels'

const props = defineProps<{
  card?: Card
  /** Carte retournée (main adverse : jamais de valeur). */
  back?: boolean
  size?: 'sm' | 'md' | 'lg'
  state?: 'normal' | 'playable' | 'blocked' | 'selected' | 'pending'
  highlight?: boolean
}>()
const label = computed(() => (props.card ? cardName(props.card) : 'Carte retournée'))
const dims = computed(
  () => ({ sm: 'h-14 w-10 text-sm', md: 'h-20 w-14 text-lg', lg: 'h-28 w-[4.5rem] text-2xl' })[props.size ?? 'md'],
)
</script>

<template>
  <span
    class="relative inline-flex select-none flex-col items-center justify-between rounded-lg border-2 bg-white px-1 py-1 font-bold leading-none shadow-sm"
    :class="[
      dims,
      back ? 'border-teal-900 bg-teal-700 text-teal-100' : card && isRed(card.suit) ? 'text-red-700' : 'text-slate-900',
      state === 'playable' ? 'border-teal-700 ring-2 ring-teal-600' : 'border-slate-400',
      state === 'blocked' ? 'opacity-40' : '',
      state === 'selected' ? '-translate-y-2 border-teal-800 ring-4 ring-teal-500' : '',
      state === 'pending' ? 'motion-safe:animate-pulse border-amber-600' : '',
      highlight ? 'ring-4 ring-amber-500' : '',
      'motion-safe:transition-transform',
    ]"
    :role="back ? 'img' : undefined"
    :aria-label="label"
  >
    <template v-if="back || !card"><span class="m-auto text-2xl" aria-hidden="true">🂠</span></template>
    <template v-else>
      <span class="self-start" aria-hidden="true">{{ RANK_SHORT[card.rank] }}</span>
      <span class="text-2xl" aria-hidden="true">{{ SUIT_SYMBOLS[card.suit] }}</span>
      <span class="self-end rotate-180" aria-hidden="true">{{ RANK_SHORT[card.rank] }}</span>
    </template>
  </span>
</template>
