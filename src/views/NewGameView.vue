<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ErrorList from '../components/ErrorList.vue'
import PageHeader from '../components/PageHeader.vue'
import RulesEditor from '../components/RulesEditor.vue'
import SegmentedChoice from '../components/SegmentedChoice.vue'
import { entityPlayerIds, nextAfter } from '../engine/game'
import { GAME_LABELS } from '../engine/types'
import type { GameKind, Rules } from '../engine/types'
import { playerKey, todayIso, useData } from '../stores/data'

const data = useData()
const route = useRoute()
const router = useRouter()

const rematch = data.game(String(route.query.rematch ?? ''))
const kind = ref<GameKind>(rematch?.kind ?? 'coinche')
const name = ref('')
const eveningId = ref<string>(rematch?.eveningId ?? String(route.query.evening ?? ''))
const newEvening = reactive({ show: false, name: '', date: todayIso() })
const rules = ref<Rules>(JSON.parse(JSON.stringify(rematch?.rules ?? data.preferences.defaults[kind.value])) as Rules)
const teamA = ref<[string, string]>(['', ''])
const teamB = ref<[string, string]>(['', ''])
const teamNames = ref<[string, string]>(['', ''])
const tarotCount = ref(rematch?.kind === 'tarot' ? rematch.playerIds.length : 4)
const tarotPlayers = ref<string[]>(['', '', '', '', '', ''])
const pickedDealer = ref('')
const busy = ref(false)
const attempted = ref(false)
const submitError = ref('')

const nameOf = (id: string) => (id ? data.playerName(id) : '')

if (rematch) {
  if (rematch.kind === 'tarot') rematch.playerIds.forEach((p, i) => (tarotPlayers.value[i] = nameOf(p)))
  else {
    const a = entityPlayerIds(rematch, 0)
    const b = entityPlayerIds(rematch, 1)
    teamA.value = [nameOf(a[0]), nameOf(a[1])]
    teamB.value = [nameOf(b[0]), nameOf(b[1])]
    teamNames.value = [
      rematch.teamIds ? (data.team(rematch.teamIds[0])?.name ?? '') : '',
      rematch.teamIds ? (data.team(rematch.teamIds[1])?.name ?? '') : '',
    ]
  }
  pickedDealer.value = nameOf(nextAfter(rematch, rematch.deals.at(-1)?.dealerId ?? rematch.firstDealerId))
}

function changeKind(k: GameKind) {
  kind.value = k
  rules.value = JSON.parse(JSON.stringify(data.preferences.defaults[k])) as Rules
  pickedDealer.value = ''
}

/** Noms dans l’ordre autour de la table : A1, B1, A2, B2, ou l’ordre tarot. */
const seatNames = computed<string[]>(() =>
  kind.value === 'tarot'
    ? tarotPlayers.value.slice(0, tarotCount.value)
    : [teamA.value[0], teamB.value[0], teamA.value[1], teamB.value[1]],
)
const knownPlayers = computed(() => [...data.players].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
const seatedKeys = computed(() => new Set(seatNames.value.map((n) => playerKey(n)).filter(Boolean)))
const availablePlayers = computed(() => knownPlayers.value.filter((p) => !seatedKeys.value.has(playerKey(p.name))))
const dealerOptions = computed(() => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of seatNames.value) {
    const n = raw.trim()
    const k = playerKey(n)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(n)
  }
  return out
})

/** Donneur choisi, ou le premier joueur dès que la table est complète. */
const resolvedDealer = computed(() => {
  const options = dealerOptions.value
  const picked = options.find((n) => playerKey(n) === playerKey(pickedDealer.value))
  if (picked) return picked
  return seatNames.value.every((n) => playerKey(n)) ? (options[0] ?? '') : ''
})
function pickDealer(value: string) {
  if (playerKey(value)) pickedDealer.value = value
}

const errors = computed(() => {
  const e: string[] = []
  const seats =
    kind.value === 'tarot'
      ? seatNames.value.map((n, i) => [`le joueur ${i + 1}`, n] as const)
      : [
          ['le joueur 1 de l’équipe A', teamA.value[0]],
          ['le joueur 2 de l’équipe A', teamA.value[1]],
          ['le joueur 1 de l’équipe B', teamB.value[0]],
          ['le joueur 2 de l’équipe B', teamB.value[1]],
        ]
  for (const [label, name] of seats) if (!name.trim()) e.push(`Écrivez le nom pour ${label}.`)
  const seen = new Map<string, string>()
  const dupes = new Set<string>()
  for (const raw of seats.map(([, n]) => n.trim()).filter(Boolean)) {
    const k = playerKey(raw)
    const previous = seen.get(k)
    if (previous) dupes.add(previous)
    else seen.set(k, raw)
  }
  for (const name of dupes) e.push(`« ${name} » est inscrit deux fois. Précisez le nom pour distinguer deux personnes.`)
  if (!e.length && !playerKey(resolvedDealer.value)) e.push('Choisissez le premier donneur.')
  if (rules.value.kind !== 'tarot' && !(rules.value.target > 0)) e.push('L’objectif doit être un nombre positif.')
  return e
})

const existingTeams = computed(() =>
  kind.value === 'tarot'
    ? []
    : [teamA.value, teamB.value].map((t) => {
        const a = data.similarPlayers(t[0])[0]
        const b = data.similarPlayers(t[1])[0]
        return a && b ? data.findTeam(a.id, b.id) : undefined
      }),
)

function placePlayer(raw: string) {
  const name = raw.trim()
  if (!name || seatedKeys.value.has(playerKey(name))) return
  if (kind.value === 'tarot') {
    const i = tarotPlayers.value.findIndex((s, idx) => idx < tarotCount.value && !s.trim())
    if (i >= 0) tarotPlayers.value[i] = name
    return
  }
  const slots: Array<[(typeof teamA)['value'], 0 | 1]> = [
    [teamA.value, 0],
    [teamA.value, 1],
    [teamB.value, 0],
    [teamB.value, 1],
  ]
  for (const [team, i] of slots) {
    if (!team[i].trim()) {
      team[i] = name
      return
    }
  }
}

function inputValue(id: string): string {
  const el = document.getElementById(id)
  return el instanceof HTMLInputElement ? el.value : ''
}
/** Relit les champs : sur téléphone, le dernier nom tapé n’est parfois pas encore dans le formulaire. */
function syncFromDom() {
  if (kind.value === 'tarot') {
    for (let i = 0; i < tarotCount.value; i++) tarotPlayers.value[i] = inputValue(`seat-t-${i + 1}`)
    return
  }
  teamA.value = [inputValue('seat-a1'), inputValue('seat-a2')]
  teamB.value = [inputValue('seat-b1'), inputValue('seat-b2')]
  teamNames.value = [inputValue('tn-0'), inputValue('tn-1')]
}

async function idForName(raw: string): Promise<string> {
  const n = raw.trim()
  const existing = data.similarPlayers(n)[0]
  return existing ? existing.id : (await data.addPlayer(n)).id
}

async function start() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  syncFromDom()
  attempted.value = true
  if (errors.value.length || busy.value) return
  busy.value = true
  submitError.value = ''
  try {
    let ev: string | null = eveningId.value && eveningId.value !== '__new' ? eveningId.value : null
    if (eveningId.value === '__new') ev = (await data.addEvening(newEvening.name, newEvening.date)).id
    const orderIds: string[] = []
    let teamAIds: [string, string] = ['', '']
    let teamBIds: [string, string] = ['', '']
    if (kind.value === 'tarot') {
      for (const n of seatNames.value) orderIds.push(await idForName(n))
    } else {
      teamAIds = [await idForName(teamA.value[0]), await idForName(teamA.value[1])]
      teamBIds = [await idForName(teamB.value[0]), await idForName(teamB.value[1])]
      orderIds.push(teamAIds[0], teamBIds[0], teamAIds[1], teamBIds[1])
    }
    const dealerAt = seatNames.value.findIndex((n) => playerKey(n) === playerKey(resolvedDealer.value))
    if (dealerAt < 0) {
      submitError.value = 'Choisissez le premier donneur.'
      busy.value = false
      return
    }
    const g = await data.createGame({
      kind: kind.value,
      name: name.value,
      eveningId: ev,
      teamA: teamAIds,
      teamB: teamBIds,
      teamNames: teamNames.value,
      tarotPlayers: orderIds,
      firstDealerId: orderIds[dealerAt],
      rules: rules.value,
    })
    await router.replace(`/partie/${g.id}`)
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PageHeader :title="rematch ? 'Revanche' : 'Nouvelle partie'" back="/" back-label="Accueil" />
  <form class="flex flex-col gap-4" novalidate @submit.prevent="start">
    <SegmentedChoice
      v-if="!rematch"
      :model-value="kind"
      label="Jeu"
      :options="(Object.keys(GAME_LABELS) as GameKind[]).map((k) => ({ value: k, label: GAME_LABELS[k] }))"
      @update:model-value="changeKind"
    />
    <p v-else class="ok">
      Revanche de la partie « {{ rematch.name || rematch.autoName }} » : mêmes joueurs et mêmes règles, modifiables
      ci-dessous.
    </p>

    <div>
      <label class="label" for="g-name">Nom de la partie (facultatif)</label>
      <input id="g-name" v-model="name" class="input" placeholder="Nom automatique si vide" />
    </div>

    <div>
      <label class="label" for="g-ev">Soirée</label>
      <select id="g-ev" v-model="eveningId" class="input">
        <option value="">Partie indépendante (sans soirée)</option>
        <option v-for="e in data.evenings" :key="e.id" :value="e.id">{{ e.name || 'Soirée' }} — {{ e.date }}</option>
        <option value="__new">＋ Nouvelle soirée…</option>
      </select>
      <div v-if="eveningId === '__new'" class="card mt-2 flex flex-col gap-2">
        <label class="label" for="ne-n">Nom de la soirée (facultatif)</label>
        <input id="ne-n" v-model="newEvening.name" class="input" placeholder="Vendredi chez Virginie" />
        <label class="label" for="ne-d">Date</label>
        <input id="ne-d" v-model="newEvening.date" type="date" class="input" />
      </div>
    </div>

    <section class="card flex flex-col gap-3" aria-labelledby="pl-h">
      <h2 id="pl-h" class="text-xl font-bold">Joueurs</h2>
      <p class="muted">Écrivez un nom dans chaque place. Un nom nouveau est enregistré tout seul.</p>

      <div v-if="availablePlayers.length" class="flex flex-col gap-2">
        <p class="label">Joueurs déjà enregistrés</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in availablePlayers"
            :key="p.id"
            type="button"
            class="btn !min-h-11 !px-3"
            @click="placePlayer(p.name)"
          >
            {{ p.name }}
          </button>
        </div>
      </div>

      <template v-if="kind !== 'tarot'">
        <fieldset class="flex flex-col gap-2 rounded-xl border-2 border-slate-300 p-3">
          <legend class="px-1 font-bold">Équipe A</legend>
          <div>
            <label class="label" for="seat-a1">Joueur 1</label>
            <input
              id="seat-a1"
              v-model="teamA[0]"
              class="input"
              placeholder="Ex. Camille"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="words"
              data-testid="seat-a1"
            />
          </div>
          <div>
            <label class="label" for="seat-a2">Joueur 2</label>
            <input
              id="seat-a2"
              v-model="teamA[1]"
              class="input"
              placeholder="Ex. Louis"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="words"
              data-testid="seat-a2"
            />
          </div>
          <p v-if="existingTeams[0]" class="ok">{{ data.teamName(existingTeams[0]!.id) }} · historique conservé</p>
          <div>
            <label class="label" for="tn-0">Nom de l’équipe (facultatif)</label>
            <input id="tn-0" v-model="teamNames[0]" class="input" placeholder="Ex. Les As" />
          </div>
        </fieldset>
        <fieldset class="flex flex-col gap-2 rounded-xl border-2 border-slate-300 p-3">
          <legend class="px-1 font-bold">Équipe B</legend>
          <div>
            <label class="label" for="seat-b1">Joueur 1</label>
            <input
              id="seat-b1"
              v-model="teamB[0]"
              class="input"
              placeholder="Ex. Inès"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="words"
              data-testid="seat-b1"
            />
          </div>
          <div>
            <label class="label" for="seat-b2">Joueur 2</label>
            <input
              id="seat-b2"
              v-model="teamB[1]"
              class="input"
              placeholder="Ex. Marc"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="words"
              data-testid="seat-b2"
            />
          </div>
          <p v-if="existingTeams[1]" class="ok">{{ data.teamName(existingTeams[1]!.id) }} · historique conservé</p>
          <div>
            <label class="label" for="tn-1">Nom de l’équipe (facultatif)</label>
            <input id="tn-1" v-model="teamNames[1]" class="input" placeholder="Ex. Les As" />
          </div>
        </fieldset>
      </template>
      <template v-else>
        <SegmentedChoice
          v-model="tarotCount"
          label="Nombre de joueurs inscrits"
          :options="[3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))"
        />
        <p v-if="tarotCount === 6" class="note">6 joueurs : donneur au repos, rotation à chaque donne.</p>
        <div v-for="i in tarotCount" :key="i">
          <label class="label" :for="`seat-t-${i}`">Joueur {{ i }} (ordre autour de la table)</label>
          <input
            :id="`seat-t-${i}`"
            v-model="tarotPlayers[i - 1]"
            class="input"
            placeholder="Ex. Camille"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="words"
            :data-testid="`seat-t${i}`"
          />
        </div>
      </template>
    </section>

    <fieldset>
      <legend class="label">Premier donneur</legend>
      <div v-if="dealerOptions.length" class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Premier donneur">
        <button
          v-for="n in dealerOptions"
          :key="playerKey(n)"
          type="button"
          role="radio"
          :aria-checked="playerKey(n) === playerKey(resolvedDealer)"
          class="btn justify-start !px-3"
          :class="playerKey(n) === playerKey(resolvedDealer) ? 'btn-primary' : ''"
          data-testid="first-dealer"
          @click="pickDealer(n)"
        >
          <span aria-hidden="true">{{ playerKey(n) === playerKey(resolvedDealer) ? '✓' : '' }}</span>
          <span class="truncate">{{ n }}</span>
        </button>
      </div>
      <p v-else class="muted">Écrivez d’abord les joueurs : ils apparaîtront ici.</p>
      <p v-if="resolvedDealer" class="muted mt-1">
        Par défaut : {{ kind === 'tarot' ? 'le joueur 1' : 'le joueur 1 de l’équipe A' }}. Touchez un autre nom pour
        changer.
      </p>
    </fieldset>

    <details class="card">
      <summary class="cursor-pointer text-lg font-bold">Règles de cette partie</summary>
      <RulesEditor v-model="rules" />
    </details>

    <ErrorList v-if="attempted" :errors="errors" />
    <p v-if="submitError" class="err" role="alert">{{ submitError }}</p>
    <button class="btn btn-primary !min-h-14 text-xl" :disabled="busy" data-testid="start-game">
      {{ busy ? 'Enregistrement…' : 'Commencer la partie' }}
    </button>
  </form>
</template>
