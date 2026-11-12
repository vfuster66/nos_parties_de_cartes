<script setup lang="ts">
// Tapis ovale pour 3 à 6 joueurs : moi en bas, les autres répartis autour dans l'ordre du jeu.
// Les cartes du pli sont posées entre le centre et le joueur qui les a jouées.
import { computed } from 'vue'
import PlayingCard from '../PlayingCard.vue'
import type { Face } from '../../cardface'

export interface TableSeat {
  seat: number
  name: string
  isMe: boolean
  connected: boolean
  turn: boolean
  dealer?: boolean
  taker?: boolean
  called?: boolean
  resting?: boolean
  partner?: boolean
  /** Courte ligne sous le pseudo : nombre de cartes, dernière enchère… */
  caption?: string
}
export interface TablePlay {
  seat: number
  face: Face
  winner?: boolean
}
const props = defineProps<{ seats: TableSeat[]; plays: TablePlay[]; fading?: boolean; simpleFigures?: boolean }>()
const n = computed(() => props.seats.length)
const height = computed(() => (n.value <= 3 ? '16rem' : n.value === 4 ? '17rem' : '21rem'))
const cardW = computed(() => (n.value <= 4 ? '14%' : '11.5%'))

const angle = (i: number) => (2 * Math.PI * i) / n.value
const tagPos = (i: number) => {
  const a = angle(i)
  const x = 50 - 39 * Math.sin(a)
  return { x, y: 50 + 40 * Math.cos(a) }
}
const slotOf = (seat: number) => props.seats.findIndex((s) => s.seat === seat)
function tagStyle(i: number): Record<string, string> {
  const { x, y } = tagPos(i)
  const base: Record<string, string> = { top: `${y}%`, maxWidth: n.value > 4 ? '24%' : '27%' }
  if (x < 30) return { ...base, left: '1%', transform: 'translateY(-50%)' }
  if (x > 70) return { ...base, right: '1%', transform: 'translateY(-50%)' }
  return { ...base, left: `${x}%`, transform: 'translate(-50%, -50%)' }
}
function playStyle(seat: number): Record<string, string> {
  const i = slotOf(seat)
  const a = angle(i)
  const ry = n.value <= 3 ? 16 : n.value === 4 ? 17 : 21
  const rx = n.value >= 5 ? 27 : 21
  return {
    left: `${50 - rx * Math.sin(a)}%`,
    top: `${50 + ry * Math.cos(a)}%`,
    width: cardW.value,
    '--from-x': `${-Math.sin(a) * 70}px`,
    '--from-y': `${Math.cos(a) * 70}px`,
  }
}
const line = (s: TableSeat): string => {
  if (s.turn) return '▶ à jouer'
  const r = role(s)
  if (r.length) return r.join(' · ')
  return [s.partner ? 'Partenaire' : '', s.caption ?? ''].filter(Boolean).join(' · ')
}
const role = (s: TableSeat): string[] =>
  [s.dealer ? 'Donneur' : '', s.taker ? 'Preneur' : '', s.called ? 'Appelé' : '', s.resting ? 'Au repos' : ''].filter(
    Boolean,
  )
</script>

<template>
  <section
    class="relative overflow-hidden rounded-[2rem] border-4 border-teal-900 bg-[radial-gradient(ellipse_at_center,#2a7a53_0%,#1c5a3d_62%,#123f2a_100%)] text-white shadow-inner"
    :style="{ height }"
    aria-label="Table de jeu"
    data-testid="felt"
  >
    <div
      v-for="(s, i) in seats"
      :key="s.seat"
      class="absolute z-10 min-w-[4.5rem] rounded-xl px-2 py-1 text-center leading-tight shadow"
      :class="[
        s.turn ? 'anim-turn border-2 border-gold bg-gold-soft text-slate-900' : 'border border-white/25 bg-black/45',
        s.resting ? 'border-dashed opacity-80' : '',
      ]"
      :style="tagStyle(i)"
      :data-testid="`seat-tag-${i}`"
    >
      <p class="flex items-center justify-center gap-1 text-sm font-bold">
        <span
          :class="s.connected ? (s.turn ? 'text-teal-700' : 'text-emerald-300') : 'text-red-400'"
          :aria-label="s.connected ? 'connecté' : 'hors ligne'"
          role="img"
          >{{ s.connected ? '●' : '○' }}</span
        >
        <span class="truncate" :title="s.name">{{ s.isMe ? 'Vous' : s.name }}</span>
      </p>
      <p class="truncate text-[0.7rem] font-semibold" :class="s.turn ? '' : 'text-amber-200'">
        {{ line(s) }}
      </p>
    </div>
    <div
      v-for="p in plays"
      :key="p.seat"
      class="anim-drop absolute z-0 -translate-x-1/2 -translate-y-1/2"
      :class="fading && !p.winner ? 'opacity-60' : ''"
      :style="playStyle(p.seat)"
      data-testid="trick-card"
    >
      <PlayingCard :face="p.face" :highlight="p.winner" :simple-figures="simpleFigures" />
    </div>
  </section>
</template>
