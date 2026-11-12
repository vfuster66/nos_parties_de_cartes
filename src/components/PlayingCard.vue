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
const cornerSymbol = computed(() => (props.face?.kind === 'trump' ? '★' : props.face?.kind === 'excuse' ? 'EX' : ''))
const stateMark = computed(() =>
  props.state === 'playable' ? '▶' : props.state === 'selected' ? '✓' : props.state === 'pending' ? '…' : '',
)
const courtCard = computed(() => props.face?.kind === 'suit' && ['V', 'C', 'D', 'R'].includes(props.face.rank))
const courtSuitRed = computed(() => (props.face?.kind === 'suit' ? isRedSuit(props.face.suit) : false))
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
        <span
          class="min-w-[1.35em] rounded-[0.18em] bg-white/95 px-[0.12em] py-[0.08em] text-center text-[30cqw] shadow-sm"
          >{{ rank }}</span
        >
        <span
          v-if="face.kind === 'suit'"
          class="mt-[0.04em] min-w-[1.35em] rounded-[0.18em] bg-white/95 px-[0.12em] text-center text-[26cqw] shadow-sm"
          >{{ faceSymbol(face) }}</span
        >
        <span
          v-else-if="cornerSymbol"
          class="mt-[0.04em] rounded-[0.18em] bg-white/95 px-[0.18em] py-[0.08em] text-center text-[20cqw] shadow-sm"
          >{{ cornerSymbol }}</span
        >
      </span>
      <span
        v-if="stateMark"
        class="absolute right-[7%] top-[5%] flex aspect-square w-[24%] items-center justify-center rounded-full border border-slate-700 bg-white text-[21cqw] font-black text-slate-950 shadow-sm"
        aria-hidden="true"
        >{{ stateMark }}</span
      >
      <svg
        v-if="courtCard"
        class="absolute inset-x-[17%] top-[24%] h-[53%] w-[66%]"
        viewBox="0 0 100 130"
        role="presentation"
        aria-hidden="true"
      >
        <g>
          <rect x="5" y="3" width="90" height="124" rx="12" fill="#fff2da" />
          <path d="M5 66h90v61H5z" fill="#f1dfc0" />
          <g :fill="courtSuitRed ? '#ef4d3e' : '#153c50'">
            <path d="M17 48Q20 27 36 24h28q16 3 19 24l8 30-12 15H21L9 78z" />
            <path d="M23 84q27-13 54 0l9 22H14z" />
          </g>
          <path d="M35 24 29 11l13 7 8-14 8 14 13-7-6 15" fill="#efa900" stroke="#a85c00" stroke-width="2" />
          <path d="M35 41q1-15 15-15t15 15l-4 19q-11 9-22 0z" fill="#ffe0b2" stroke="#153c50" stroke-width="2" />
          <path d="M34 42q0-20 17-20 13 0 16 15l-8-3-8-7q-4 8-17 10z" fill="#153c50" />
          <path
            d="M48 48h2m9 0h2m-8 5 3 2m-9 6q6 4 12 0"
            fill="none"
            stroke="#153c50"
            stroke-linecap="round"
            stroke-width="2"
          />
          <path
            d="M29 73q21 10 42 0m-21-8v19m-10-3 10 7 10-7"
            fill="none"
            stroke="#efa900"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="4"
          />
          <path d="M14 99h72m-62 9h52" stroke="#158b87" stroke-linecap="round" stroke-width="3" />
          <g transform="rotate(180 50 65)">
            <path
              d="M17 48Q20 27 36 24h28q16 3 19 24l8 30-12 15H21L9 78z"
              :fill="courtSuitRed ? '#ef4d3e' : '#153c50'"
            />
            <path d="M23 84q27-13 54 0l9 22H14z" :fill="courtSuitRed ? '#ef4d3e' : '#153c50'" />
            <path d="M35 24 29 11l13 7 8-14 8 14 13-7-6 15" fill="#efa900" stroke="#a85c00" stroke-width="2" />
            <path d="M35 41q1-15 15-15t15 15l-4 19q-11 9-22 0z" fill="#ffe0b2" stroke="#153c50" stroke-width="2" />
            <path d="M34 42q0-20 17-20 13 0 16 15l-8-3-8-7q-4 8-17 10z" fill="#153c50" />
            <path
              d="M29 73q21 10 42 0m-21-8v19m-10-3 10 7 10-7"
              fill="none"
              stroke="#efa900"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="4"
            />
          </g>
          <circle cx="50" cy="65" r="4" fill="#efa900" />
        </g>
        <rect x="5" y="3" width="90" height="124" rx="12" fill="none" stroke="#153c50" stroke-width="2" />
      </svg>
      <span
        v-else-if="face.kind === 'suit'"
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
      <span
        v-else
        class="absolute inset-0 flex flex-col items-center justify-center pt-[14%] text-amber-900"
        aria-hidden="true"
      >
        <span class="text-[56cqw] leading-none">★</span>
        <span
          class="mt-[4%] rounded-full border border-amber-700 bg-amber-100 px-[12%] py-[4%] text-[19cqw] font-black tracking-[0.12em]"
          >EXCUSE</span
        >
      </span>
      <span class="absolute bottom-[5%] right-[9%] rotate-180 text-[30cqw] leading-none" aria-hidden="true">{{
        face.kind === 'suit' ? rank : ''
      }}</span>
    </template>
  </span>
</template>
