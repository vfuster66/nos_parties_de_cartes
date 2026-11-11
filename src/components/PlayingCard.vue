<script setup lang="ts">
// Carte dessinée en CSS : indice en coin (rang + couleur), grand symbole central. Toute la taille des textes
// suit la largeur de la carte (unités de conteneur) : la même carte sert en main de 24 cartes comme au centre du pli.
import { computed } from 'vue'
import { faceName, isRedSuit, faceSymbol } from '../cardface'
import type { Face } from '../cardface'

const props = defineProps<{
  face?: Face
  /** Carte retournée (main adverse : jamais de valeur). */
  back?: boolean
  state?: 'normal' | 'playable' | 'blocked' | 'selected' | 'pending'
  highlight?: boolean
}>()
const label = computed(() => (props.face && !props.back ? faceName(props.face) : 'Carte retournée'))
const tone = computed(() => {
  const f = props.face
  if (!f || props.back) return 'text-teal-100'
  if (f.kind === 'suit') return isRedSuit(f.suit) ? 'text-suit-red' : 'text-suit-black'
  return f.kind === 'trump' ? 'text-trump' : 'text-amber-800'
})
const rank = computed(() => {
  const f = props.face
  if (!f) return ''
  return f.kind === 'suit' ? f.rank : f.kind === 'trump' ? String(f.n) : '★'
})
</script>

<template>
  <span
    class="relative block aspect-[5/7] w-full select-none overflow-hidden rounded-[9%/6.5%] border bg-white font-bold leading-none shadow-[0_1px_2px_rgb(0_0_0/0.35)] [container-type:inline-size]"
    :class="[
      back
        ? 'border-teal-900 bg-teal-700'
        : face?.kind === 'trump'
          ? 'border-trump/60 bg-[#f3f5fb]'
          : 'border-slate-400',
      face?.kind === 'excuse' && !back ? 'bg-amber-50' : '',
      tone,
      state === 'playable' ? '!border-teal-700 ring-2 ring-teal-600' : '',
      state === 'blocked' ? 'opacity-40 saturate-50' : '',
      state === 'selected' ? '!border-gold ring-4 ring-gold' : '',
      state === 'pending' ? 'ring-4 ring-amber-500 motion-safe:animate-pulse' : '',
      highlight ? 'ring-4 ring-gold' : '',
    ]"
    :role="back ? 'img' : undefined"
    :aria-label="label"
  >
    <template v-if="back || !face">
      <span
        class="absolute inset-[9%] rounded-[8%] border border-teal-300/60 bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgb(255_255_255/0.12)_6px_7px)]"
        aria-hidden="true"
      />
    </template>
    <template v-else>
      <span class="absolute left-[9%] top-[5%] flex flex-col items-center leading-[0.95]" aria-hidden="true">
        <span class="text-[30cqw]">{{ rank }}</span>
        <span v-if="face.kind === 'suit'" class="text-[26cqw]">{{ faceSymbol(face) }}</span>
      </span>
      <span
        v-if="face.kind === 'suit'"
        class="absolute inset-0 flex items-center justify-center pt-[14%] pl-[14%] text-[64cqw] opacity-95"
        aria-hidden="true"
        >{{ faceSymbol(face) }}</span
      >
      <span
        v-else-if="face.kind === 'trump'"
        class="absolute inset-x-[14%] bottom-[10%] top-[40%] flex items-center justify-center rounded-md border-2 border-trump/50 text-[44cqw]"
        aria-hidden="true"
        >{{ face.n }}</span
      >
      <span v-else class="absolute inset-0 flex items-center justify-center pt-[14%] text-[60cqw]" aria-hidden="true"
        >★</span
      >
      <span class="absolute bottom-[5%] right-[9%] rotate-180 text-[30cqw] leading-none" aria-hidden="true">{{
        face.kind === 'suit' ? rank : ''
      }}</span>
    </template>
  </span>
</template>
