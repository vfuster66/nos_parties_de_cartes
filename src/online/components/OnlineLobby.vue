<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { Seat } from '../../../shared/coinche/cards'
import { isOnlineTarot } from '../../../shared/coinche/types'
import type { RoomView } from '../../../shared/coinche/views'
import { askConfirm } from '../../confirm'
import { teamName } from '../labels'
import { useOnline } from '../store'
import ShareRoom from './ShareRoom.vue'

const props = defineProps<{ view: RoomView }>()
const emit = defineEmits<{ left: [] }>()
const online = useOnline()
const a = computed(() => props.view.actions)
const busy = computed(() => !!online.pending)
const seats = computed(() => props.view.seats.map((_, index) => index as Seat))
const tarot = computed(() => isOnlineTarot(props.view.config.game))
const nick = (pid: string | null): string => props.view.participants.find((p) => p.id === pid)?.nickname ?? ''
const me = computed(() => props.view.participants.find((p) => p.id === props.view.you.participantId)!)

const form = reactive({
  gameName: '',
  team0: '',
  team1: '',
  rounding: 'rounded' as 'rounded' | 'exact',
  target: 3000,
  tarotEndMode: 'free' as 'free' | 'threshold',
  firstDealer: 'random' as 'random' | Seat,
})
watch(
  () => props.view.config,
  (c) => {
    form.gameName = c.gameName
    form.team0 = c.teamNames[0]
    form.team1 = c.teamNames[1]
    form.rounding = c.rounding
    form.target = c.target
    form.tarotEndMode = c.tarotEndMode ?? 'free'
    form.firstDealer = c.firstDealer
  },
  { immediate: true, deep: true },
)
const targetOk = computed(
  () => Number.isInteger(form.target) && form.target >= 100 && form.target <= 20000 && form.target % 10 === 0,
)
const dirty = computed(() => {
  const c = props.view.config
  return (
    form.gameName !== c.gameName ||
    form.team0 !== c.teamNames[0] ||
    form.team1 !== c.teamNames[1] ||
    form.rounding !== c.rounding ||
    form.target !== c.target ||
    form.tarotEndMode !== (c.tarotEndMode ?? 'free') ||
    form.firstDealer !== c.firstDealer
  )
})
async function saveConfig(): Promise<void> {
  if (!targetOk.value) return
  await online.send('configure', {
    gameName: form.gameName.trim() || undefined,
    teamNames: [form.team0 || 'Équipe 1', form.team1 || 'Équipe 2'],
    rounding: form.rounding,
    target: form.target,
    ...(tarot.value ? { tarotEndMode: form.tarotEndMode } : {}),
    firstDealer: form.firstDealer,
  })
}

const part = (pid: string | null) => props.view.participants.find((p) => p.id === pid)
const seated = computed(() => props.view.seats.filter(Boolean).length)
const readyCount = computed(() => props.view.seats.filter((s) => part(s)?.ready).length)
const unseated = computed(() => props.view.participants.filter((p) => p.seat == null))
const initial = (name: string): string => [...name.trim()][0]?.toUpperCase() ?? '?'
const rulesSummary = computed(() => {
  const c = props.view.config
  return tarot.value
    ? `Objectif ${c.target} · ${c.tarotEndMode === 'threshold' ? 'seuil' : 'arrêt libre'}`
    : `Objectif ${c.target} · ${c.rounding === 'rounded' ? 'arrondi à la dizaine' : 'points réels'}`
})
const gameTitle = computed(() =>
  tarot.value
    ? 'Tarot à ' + seats.value.length + ' joueurs'
    : props.view.config.game === 'belote-annonces'
      ? 'Belote avec annonces'
      : props.view.config.game === 'belote'
        ? 'Belote sans annonces'
        : 'Coinche',
)
/** Éléments bloquants affichés dans la barre d’action. */
const missing = computed(() => {
  const out: string[] = []
  const free = seats.value.length - seated.value
  if (free) out.push(`${free} place${free > 1 ? 's' : ''} à prendre`)
  const off = props.view.participants.filter((p) => p.seat != null && !p.connected).length
  if (off) out.push(`${off} joueur${off > 1 ? 's' : ''} hors ligne`)
  const notReady = seated.value - readyCount.value
  if (notReady) out.push(`${notReady} joueur${notReady > 1 ? 's' : ''} pas prêt${notReady > 1 ? 's' : ''}`)
  return out
})
async function kick(pid: string): Promise<void> {
  if (
    await askConfirm({
      title: 'Retirer ce joueur ?',
      message: `${nick(pid)} sera retiré du salon.`,
      confirmLabel: 'Retirer',
    })
  )
    await online.send('kick', { participantId: pid })
}
async function assign(pid: string, value: string): Promise<void> {
  await online.send('assignSeat', { participantId: pid, seat: value === '' ? null : (Number(value) as Seat) })
}
async function leave(): Promise<void> {
  if (
    !(await askConfirm({
      title: 'Quitter le salon ?',
      message: 'Vous pourrez le rejoindre à nouveau avec le code.',
      confirmLabel: 'Quitter',
    }))
  )
    return
  if (await online.send('leaveRoom')) {
    online.forget(props.view.roomId)
    emit('left')
  }
}
async function closeRoom(): Promise<void> {
  if (
    !(await askConfirm({
      title: 'Fermer le salon ?',
      message: 'La partie sera abandonnée pour tout le monde. Aucune victoire ne sera attribuée.',
      confirmLabel: 'Fermer le salon',
    }))
  )
    return
  await online.send('abandon', { confirm: true })
}
</script>

<template>
  <div class="flex flex-col gap-3 pb-2" data-testid="lobby">
    <header>
      <p class="eyebrow">Salon privé</p>
      <h1 class="text-2xl font-bold">{{ gameTitle }}</h1>
    </header>
    <ShareRoom :code="view.code" :title="gameTitle" />

    <section class="card !p-3" aria-labelledby="seats-title">
      <div class="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="seats-title" class="text-xl font-bold">Places</h2>
        <p class="text-sm font-semibold" role="status" data-testid="lobby-progress">
          {{ seated }}/{{ seats.length }} assis · {{ readyCount }}/{{ seats.length }} prêts
        </p>
      </div>
      <ul class="flex flex-col gap-2">
        <li
          v-for="s in seats"
          :key="s"
          class="rounded-xl border-2 p-2.5"
          :class="view.seats[s] ? 'border-stone-300 bg-white' : 'border-dashed border-stone-400 bg-stone-50'"
          :data-testid="`seat-${s}`"
        >
          <div class="flex items-center gap-3">
            <span
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold"
              :class="
                view.seats[s] ? 'bg-teal-700 text-white' : 'border-2 border-dashed border-stone-400 text-stone-500'
              "
              aria-hidden="true"
              >{{ view.seats[s] ? initial(nick(view.seats[s])) : s + 1 }}</span
            >
            <div class="min-w-0 flex-1">
              <p class="text-xs font-semibold text-slate-600">
                Place {{ s + 1
                }}<template v-if="!tarot">
                  · {{ s % 2 === 0 ? '●' : '■' }} {{ teamName(view, (s % 2) as 0 | 1) }}</template
                >
              </p>
              <template v-if="view.seats[s]">
                <p class="truncate font-bold" :title="nick(view.seats[s])">
                  {{ nick(view.seats[s]) }}<span v-if="view.seats[s] === view.you.participantId"> (vous)</span>
                </p>
                <p class="mt-0.5 flex flex-wrap gap-1">
                  <span v-if="part(view.seats[s])?.isHost" class="badge bg-stone-200">Hôte</span>
                  <span v-if="!part(view.seats[s])?.connected" class="badge bg-red-100 text-red-900">○ Hors ligne</span>
                  <span v-if="part(view.seats[s])?.ready" class="badge bg-teal-100 text-teal-900">✓ Prêt</span>
                  <span v-else class="badge bg-amber-100 text-amber-900">… Pas prêt</span>
                </p>
              </template>
              <p v-else class="muted">Place libre</p>
            </div>
            <button
              v-if="a.freeSeats.includes(s)"
              class="btn btn-primary !min-h-11 shrink-0 !px-3"
              :disabled="busy"
              data-testid="take-seat"
              @click="online.send('takeSeat', { seat: s })"
            >
              {{ me.seat == null ? "S'asseoir" : 'Ici'
              }}<span class="sr-only">{{ me.seat == null ? '' : ' (changer pour cette place)' }}</span>
            </button>
          </div>
          <details v-if="a.canManageSeats && view.seats[s] && view.seats[s] !== view.you.participantId" class="mt-2">
            <summary class="cursor-pointer text-sm font-semibold text-slate-700">
              Gérer {{ nick(view.seats[s]) }}
            </summary>
            <div class="mt-1 flex gap-2">
              <select
                class="input !min-h-11 flex-1"
                :value="s"
                :aria-label="`Place de ${nick(view.seats[s])}`"
                @change="assign(view.seats[s]!, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">Sans place</option>
                <option
                  v-for="t in seats"
                  :key="t"
                  :value="t"
                  :disabled="!!view.seats[t] && view.seats[t] !== view.seats[s]"
                >
                  Place {{ t + 1 }}
                </option>
              </select>
              <button class="btn !min-h-11" @click="kick(view.seats[s]!)">Retirer</button>
            </div>
          </details>
        </li>
      </ul>
      <button
        v-if="a.canLeaveSeat"
        class="btn mt-2 w-full !min-h-11"
        :disabled="busy"
        @click="online.send('leaveSeat')"
      >
        Libérer ma place
      </button>
    </section>

    <section v-if="unseated.length" class="card !p-3" aria-labelledby="who-title" data-testid="unseated">
      <h2 id="who-title" class="mb-2 text-lg font-bold">Dans le salon, sans place ({{ unseated.length }})</h2>
      <ul class="flex flex-col gap-2">
        <li v-for="p in unseated" :key="p.id" class="flex flex-wrap items-center gap-2" data-testid="participant">
          <span
            :class="p.connected ? 'text-teal-700' : 'text-slate-500'"
            role="img"
            :aria-label="p.connected ? 'connecté' : 'déconnecté'"
            >{{ p.connected ? '●' : '○' }}</span
          >
          <span class="font-semibold">{{ p.nickname }}</span>
          <span v-if="p.isHost" class="badge bg-stone-200">Hôte</span>
          <span v-if="p.id === view.you.participantId" class="muted">(vous)</span>
          <template v-if="a.canManageSeats && p.id !== view.you.participantId">
            <select
              class="input !min-h-11 !w-auto"
              :aria-label="`Place de ${p.nickname}`"
              @change="assign(p.id, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">Sans place</option>
              <option v-for="s in seats" :key="s" :value="s" :disabled="!!view.seats[s]">Place {{ s + 1 }}</option>
            </select>
            <button class="btn !min-h-11" @click="kick(p.id)">Retirer</button>
          </template>
        </li>
      </ul>
    </section>

    <details class="card !p-3" data-testid="rules-panel">
      <summary class="cursor-pointer" data-testid="rules-toggle">
        <span class="text-xl font-bold">Règles</span>
        <span class="muted block !text-sm">{{ rulesSummary }}</span>
      </summary>
      <form v-if="a.canConfigure" class="mt-3 flex flex-col gap-3" @submit.prevent="saveConfig">
        <div>
          <label class="label" for="gname">Nom de la partie</label>
          <input id="gname" v-model="form.gameName" class="input" maxlength="40" autocomplete="off" />
        </div>
        <div v-if="!tarot" class="grid grid-cols-2 gap-2">
          <div>
            <label class="label" for="t0">Équipe places 1 et 3</label>
            <input id="t0" v-model="form.team0" class="input" maxlength="20" autocomplete="off" />
          </div>
          <div>
            <label class="label" for="t1">Équipe places 2 et 4</label>
            <input id="t1" v-model="form.team1" class="input" maxlength="20" autocomplete="off" />
          </div>
        </div>
        <fieldset v-if="!tarot">
          <legend class="label">Calcul des points</legend>
          <label class="mr-4"
            ><input v-model="form.rounding" type="radio" value="rounded" /> Arrondi à la dizaine</label
          >
          <label><input v-model="form.rounding" type="radio" value="exact" /> Points réels</label>
        </fieldset>
        <div>
          <label v-if="tarot" class="label">
            Fin de partie
            <select v-model="form.tarotEndMode" class="input">
              <option value="free">Arrêt libre</option>
              <option value="threshold">Seuil positif ou négatif</option>
            </select>
          </label>
          <label class="label" for="target">Objectif (points)</label>
          <input
            id="target"
            v-model.number="form.target"
            class="input"
            type="number"
            inputmode="numeric"
            min="100"
            max="20000"
            step="10"
          />
          <p v-if="!targetOk" class="err mt-1">Entre 100 et 20 000, multiple de 10.</p>
        </div>
        <div>
          <label class="label" for="dealer">Premier donneur</label>
          <select id="dealer" v-model="form.firstDealer" class="input">
            <option value="random">Tirage au sort au lancement</option>
            <option v-for="s in seats" :key="s" :value="s">
              Place {{ s + 1 }}{{ view.seats[s] ? ` (${nick(view.seats[s])})` : '' }}
            </option>
          </select>
        </div>
        <button class="btn" :disabled="!dirty || !targetOk || busy" data-testid="save-config">
          Enregistrer les règles
        </button>
        <p class="muted text-sm">Modifier annule les prêts.</p>
      </form>
      <dl v-else class="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
        <dt class="muted">Nom</dt>
        <dd>{{ view.config.gameName || '—' }}</dd>
        <dt v-if="!tarot" class="muted">Équipes</dt>
        <dd v-if="!tarot">{{ view.config.teamNames.join(' / ') }}</dd>
        <dt class="muted">Calcul</dt>
        <dd>{{ tarot || view.config.rounding === 'rounded' ? 'Arrondi' : 'Points réels' }}</dd>
        <dt class="muted">Objectif</dt>
        <dd>{{ view.config.target }}</dd>
        <dt class="muted">Premier donneur</dt>
        <dd>
          {{ view.config.firstDealer === 'random' ? 'Tirage au sort' : `Place ${Number(view.config.firstDealer) + 1}` }}
        </dd>
      </dl>
    </details>

    <button v-if="a.canAbandon" class="btn btn-danger" @click="closeRoom">Fermer le salon</button>
    <button v-else class="btn" @click="leave">Quitter le salon</button>

    <!-- Action principale toujours à portée de pouce -->
    <section
      class="sticky bottom-2 z-20 flex flex-col gap-2 rounded-2xl border border-stone-300 bg-white/95 p-2.5 shadow-xl backdrop-blur"
      aria-label="Action principale"
    >
      <p v-if="missing.length" class="text-center text-sm font-semibold" role="status" data-testid="missing">
        {{ missing.join(' · ') }}
      </p>
      <p v-else class="text-center text-sm font-semibold text-teal-800" role="status" data-testid="missing">
        ✓ Tous prêts{{ view.you.isHost ? '' : ' · En attente de l’hôte' }}
      </p>
      <div class="grid gap-2" :class="view.you.isHost && a.canReady ? 'grid-cols-2' : ''">
        <button
          v-if="a.canReady"
          class="btn !min-h-14"
          :class="me.ready ? '' : 'btn-primary'"
          :disabled="busy"
          data-testid="ready"
          @click="online.send('setReady', { ready: !me.ready })"
        >
          {{ me.ready ? '✓ Prêt (annuler)' : 'Je suis prêt' }}
        </button>
        <button
          v-if="view.you.isHost"
          class="btn !min-h-14"
          :class="a.canStart ? 'btn-gold' : ''"
          :disabled="!a.canStart || busy"
          data-testid="start"
          @click="online.send('start')"
        >
          Lancer la partie
        </button>
      </div>
    </section>
  </div>
</template>
