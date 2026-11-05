<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ErrorList from '../components/ErrorList.vue'
import PageHeader from '../components/PageHeader.vue'
import PlayerSelect from '../components/PlayerSelect.vue'
import RulesEditor from '../components/RulesEditor.vue'
import SegmentedChoice from '../components/SegmentedChoice.vue'
import { entityPlayerIds, nextAfter } from '../engine/game'
import { GAME_LABELS } from '../engine/types'
import type { GameKind, Rules } from '../engine/types'
import { todayIso, useData } from '../stores/data'

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
const firstDealer = ref('')
const quickName = ref('')
const busy = ref(false)
const submitError = ref('')

if (rematch) {
  if (rematch.kind === 'tarot') rematch.playerIds.forEach((p, i) => (tarotPlayers.value[i] = p))
  else {
    teamA.value = entityPlayerIds(rematch, 0) as [string, string]
    teamB.value = entityPlayerIds(rematch, 1) as [string, string]
    teamNames.value = [
      rematch.teamIds ? (data.team(rematch.teamIds[0])?.name ?? '') : '',
      rematch.teamIds ? (data.team(rematch.teamIds[1])?.name ?? '') : '',
    ]
  }
  firstDealer.value = nextAfter(rematch, rematch.deals.at(-1)?.dealerId ?? rematch.firstDealerId)
}

function changeKind(k: GameKind) {
  kind.value = k
  rules.value = JSON.parse(JSON.stringify(data.preferences.defaults[k])) as Rules
  firstDealer.value = ''
}

const chosen = computed<string[]>(() =>
  kind.value === 'tarot' ? tarotPlayers.value.slice(0, tarotCount.value) : [...teamA.value, ...teamB.value],
)
const tableOrder = computed<string[]>(() =>
  kind.value === 'tarot' ? chosen.value : [teamA.value[0], teamB.value[0], teamA.value[1], teamB.value[1]],
)
const errors = computed(() => {
  const e: string[] = []
  const filled = chosen.value.filter(Boolean)
  if (kind.value !== 'tarot') {
    if (teamA.value.some((p) => !p)) e.push('L’équipe A est incomplète : choisissez deux joueurs.')
    if (teamB.value.some((p) => !p)) e.push('L’équipe B est incomplète : choisissez deux joueurs.')
  } else if (filled.length < tarotCount.value) e.push(`Choisissez les ${tarotCount.value} joueurs autour de la table.`)
  if (new Set(filled).size !== filled.length) e.push('Un joueur ne peut apparaître qu’une seule fois dans une partie.')
  if (!firstDealer.value) e.push('Choisissez le premier donneur.')
  else if (!chosen.value.includes(firstDealer.value)) e.push('Le premier donneur doit faire partie des joueurs.')
  if (rules.value.kind !== 'tarot' && !(rules.value.target > 0)) e.push('L’objectif doit être un nombre positif.')
  return e
})
const existingTeams = computed(() =>
  kind.value === 'tarot'
    ? []
    : [teamA.value, teamB.value].map((t) => (t[0] && t[1] ? data.findTeam(t[0], t[1]) : undefined)),
)

async function quickAdd() {
  const n = quickName.value.trim()
  if (!n) return
  quickName.value = ''
  try {
    await data.addPlayer(n)
  } catch {
    quickName.value = n // l'erreur de sauvegarde est affichée par l'application
  }
}
const duplicates = computed(() => data.similarPlayers(quickName.value))

async function start() {
  if (errors.value.length || busy.value) return
  busy.value = true
  submitError.value = ''
  try {
    let ev: string | null = eveningId.value && eveningId.value !== '__new' ? eveningId.value : null
    if (eveningId.value === '__new') ev = (await data.addEvening(newEvening.name, newEvening.date)).id
    const g = await data.createGame({
      kind: kind.value,
      name: name.value,
      eveningId: ev,
      teamA: teamA.value,
      teamB: teamB.value,
      teamNames: teamNames.value,
      tarotPlayers: tableOrder.value,
      firstDealerId: firstDealer.value,
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
      <template v-if="kind !== 'tarot'">
        <fieldset
          v-for="(t, ti) in [teamA, teamB]"
          :key="ti"
          class="flex flex-col gap-2 rounded-xl border-2 border-slate-300 p-3"
        >
          <legend class="px-1 font-bold">Équipe {{ ti ? 'B' : 'A' }}</legend>
          <PlayerSelect
            v-model="t[0]"
            :label="`Équipe ${ti ? 'B' : 'A'} — joueur 1`"
            :exclude="chosen.filter((p) => p !== t[0])"
          />
          <PlayerSelect
            v-model="t[1]"
            :label="`Équipe ${ti ? 'B' : 'A'} — joueur 2`"
            :exclude="chosen.filter((p) => p !== t[1])"
          />
          <p v-if="existingTeams[ti]" class="ok">
            Équipe déjà connue : {{ data.teamName(existingTeams[ti]!.id) }}. Son historique sera conservé.
          </p>
          <div>
            <label class="label" :for="`tn-${ti}`">Nom de l’équipe (facultatif)</label>
            <input :id="`tn-${ti}`" v-model="teamNames[ti]" class="input" placeholder="Ex. Les As" />
          </div>
        </fieldset>
        <p class="muted">Ordre autour de la table : A1, B1, A2, B2 (les équipes alternent).</p>
      </template>
      <template v-else>
        <SegmentedChoice
          v-model="tarotCount"
          label="Nombre de joueurs inscrits"
          :options="[3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))"
        />
        <p v-if="tarotCount === 6" class="note">
          À six, cinq jouent et le donneur est au repos (il marque 0 et tourne à chaque donne).
        </p>
        <PlayerSelect
          v-for="i in tarotCount"
          :key="i"
          v-model="tarotPlayers[i - 1]"
          :label="`Joueur ${i} (ordre autour de la table)`"
          :exclude="chosen.filter((p) => p !== tarotPlayers[i - 1])"
        />
      </template>

      <div class="rounded-xl border-2 border-dashed border-slate-400 p-3">
        <label class="label" for="qa">Nouveau joueur</label>
        <div class="flex gap-2">
          <input
            id="qa"
            v-model="quickName"
            class="input"
            placeholder="Nom ou pseudo"
            @keydown.enter.prevent="quickAdd"
          />
          <button type="button" class="btn btn-primary shrink-0" :disabled="!quickName.trim()" @click="quickAdd">
            Ajouter
          </button>
        </div>
        <p v-if="duplicates.length" class="note mt-2">
          Un joueur nommé « {{ duplicates[0].name }} » existe déjà. Vous pouvez quand même ajouter un homonyme.
        </p>
      </div>
    </section>

    <PlayerSelect v-model="firstDealer" label="Premier donneur" :ids="tableOrder.filter(Boolean)" />

    <details class="card">
      <summary class="cursor-pointer text-lg font-bold">Règles de cette partie</summary>
      <p class="muted my-2">
        Copiées depuis vos préférences ; elles ne changeront plus si vous modifiez les préférences plus tard.
      </p>
      <RulesEditor v-model="rules" />
    </details>

    <ErrorList :errors="errors" />
    <p v-if="submitError" class="err" role="alert">{{ submitError }}</p>
    <button class="btn btn-primary !min-h-14 text-xl" :disabled="errors.length > 0 || busy">Commencer la partie</button>
  </form>
</template>
