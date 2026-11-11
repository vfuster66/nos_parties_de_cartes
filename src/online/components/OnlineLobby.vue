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

const startBlocker = computed(() => {
  const v = props.view
  if (v.seats.some((s) => !s)) return 'Toutes les places doivent être occupées.'
  if (v.participants.some((p) => p.seat != null && !p.connected)) return 'Un joueur est déconnecté.'
  if (!v.seats.every((s) => v.participants.find((p) => p.id === s)?.ready))
    return 'Tous les joueurs doivent être prêts.'
  return ''
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
  <div class="flex flex-col gap-4" data-testid="lobby">
    <ShareRoom :code="view.code" />

    <section class="card" aria-labelledby="seats-title">
      <h2 id="seats-title" class="mb-1 text-xl font-bold">Places</h2>
      <p v-if="!tarot" class="muted mb-3">
        Les partenaires sont face à face : {{ teamName(view, 0) }} (places 1 et 3) contre
        {{ teamName(view, 1) }} (places 2 et 4).
      </p>
      <ul class="flex flex-col gap-2">
        <li
          v-for="s in seats"
          :key="s"
          class="rounded-xl border-2 p-3"
          :class="s % 2 === 0 ? 'border-teal-300' : 'border-amber-300'"
          :data-testid="`seat-${s}`"
        >
          <p class="muted text-sm">
            Place {{ s + 1 }}<template v-if="!tarot"> · {{ teamName(view, (s % 2) as 0 | 1) }}</template>
          </p>
          <div class="flex items-center justify-between gap-2">
            <p v-if="view.seats[s]" class="font-semibold">
              {{ nick(view.seats[s]) }}
              <span v-if="view.seats[s] === view.you.participantId">(vous)</span>
              <span v-if="!view.participants.find((p) => p.id === view.seats[s])?.connected" class="muted"
                >· hors ligne</span
              >
              <span v-if="view.participants.find((p) => p.id === view.seats[s])?.ready" class="text-teal-800"
                >· prêt ✓</span
              >
            </p>
            <p v-else class="muted">Libre</p>
            <button
              v-if="a.freeSeats.includes(s)"
              class="btn !min-h-11"
              :disabled="busy"
              data-testid="take-seat"
              @click="online.send('takeSeat', { seat: s })"
            >
              {{ me.seat == null ? "S'asseoir" : 'Changer pour cette place' }}
            </button>
          </div>
        </li>
      </ul>
      <button v-if="a.canLeaveSeat" class="btn mt-2 w-full" :disabled="busy" @click="online.send('leaveSeat')">
        Libérer ma place
      </button>
    </section>

    <section class="card" aria-labelledby="who-title">
      <h2 id="who-title" class="mb-2 text-xl font-bold">
        Participants ({{ view.participants.length }}/{{ seats.length }})
      </h2>
      <ul class="flex flex-col gap-2">
        <li
          v-for="p in view.participants"
          :key="p.id"
          class="flex flex-wrap items-center gap-2"
          data-testid="participant"
        >
          <span
            :class="p.connected ? 'text-teal-700' : 'text-slate-400'"
            :aria-label="p.connected ? 'connecté' : 'déconnecté'"
            >●</span
          >
          <span class="font-semibold">{{ p.nickname }}</span>
          <span v-if="p.isHost" class="rounded bg-slate-200 px-2 text-sm">hôte</span>
          <span v-if="p.id === view.you.participantId" class="muted">(vous)</span>
          <template v-if="a.canManageSeats && p.id !== view.you.participantId">
            <select
              class="input !min-h-11 !w-auto"
              :value="p.seat ?? ''"
              :aria-label="`Place de ${p.nickname}`"
              @change="assign(p.id, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">Sans place</option>
              <option v-for="s in seats" :key="s" :value="s" :disabled="!!view.seats[s] && view.seats[s] !== p.id">
                Place {{ s + 1 }}
              </option>
            </select>
            <button class="btn !min-h-11" @click="kick(p.id)">Retirer</button>
          </template>
        </li>
      </ul>
    </section>

    <section class="card" aria-labelledby="rules-title">
      <h2 id="rules-title" class="mb-2 text-xl font-bold">
        {{
          tarot
            ? 'Tarot à ' + seats.length + ' joueurs'
            : view.config.game === 'belote-annonces'
              ? 'Belote avec annonces'
              : view.config.game === 'belote'
                ? 'Belote sans annonces'
                : 'Coinche'
        }}
      </h2>
      <form v-if="a.canConfigure" class="flex flex-col gap-3" @submit.prevent="saveConfig">
        <div>
          <label class="label" for="gname">Nom de la partie</label>
          <input id="gname" v-model="form.gameName" class="input" maxlength="40" autocomplete="off" />
        </div>
        <div v-if="!tarot" class="grid grid-cols-2 gap-2">
          <div>
            <label class="label" for="t0">Équipe des places 1 et 3</label>
            <input id="t0" v-model="form.team0" class="input" maxlength="20" autocomplete="off" />
          </div>
          <div>
            <label class="label" for="t1">Équipe des places 2 et 4</label>
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
        <p class="muted text-sm">Modifier les règles remet tous les joueurs « pas prêts ».</p>
      </form>
      <dl v-else class="grid grid-cols-2 gap-x-3 gap-y-1">
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
    </section>

    <section class="flex flex-col gap-2">
      <button
        v-if="a.canReady"
        class="btn !min-h-14"
        :class="me.ready ? '' : 'btn-primary'"
        :disabled="busy"
        data-testid="ready"
        @click="online.send('setReady', { ready: !me.ready })"
      >
        {{ me.ready ? 'Je ne suis plus prêt' : 'Je suis prêt' }}
      </button>
      <p v-else class="note">Choisissez une place pour pouvoir vous déclarer prêt.</p>
      <template v-if="view.you.isHost">
        <button
          class="btn btn-primary !min-h-14"
          :disabled="!a.canStart || busy"
          data-testid="start"
          @click="online.send('start')"
        >
          Lancer la partie
        </button>
        <p v-if="startBlocker" class="muted" role="status">{{ startBlocker }}</p>
      </template>
      <p v-else class="muted" role="status">L’hôte lancera la partie quand tout le monde sera prêt.</p>
      <button v-if="a.canAbandon" class="btn btn-danger" @click="closeRoom">Fermer le salon</button>
      <button v-else class="btn" @click="leave">Quitter le salon</button>
    </section>
  </div>
</template>
