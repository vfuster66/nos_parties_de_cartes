<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ErrorList from '../components/ErrorList.vue'
import PageHeader from '../components/PageHeader.vue'
import { askConfirm } from '../confirm'
import { computeGame, entityPlayerIds } from '../engine/game'
import { describeDeal } from '../engine/describe'
import { gameTitle } from '../engine/model'
import { outcomeLabel, signed } from '../labels'
import { sum } from '../engine/types'
import { useData } from '../stores/data'

const props = defineProps<{ id: string }>()
const data = useData()
const router = useRouter()
const game = computed(() => data.game(props.id))
const state = computed(() => (game.value ? computeGame(game.value) : null))
const actionError = ref('')
const names = computed(() => ({
  player: (id: string) => data.playerName(id),
  team: (i: 0 | 1) => data.gameTeamName(game.value!, i),
}))
const entities = computed(() => {
  const g = game.value!
  return state.value!.totals.map((total, i) => ({
    total,
    title: g.kind === 'tarot' ? data.playerName(g.playerIds[i]) : data.gameTeamName(g, i as 0 | 1),
    members: g.kind === 'tarot' ? '' : entityPlayerIds(g, i).map((p) => data.playerName(p)).join(' & '),
  }))
})
const hasDraft = computed(() => !!data.getDraft(props.id, null))
const undo = computed(() => data.lastUndo(props.id))
const canFinish = computed(() => !!game.value && !!state.value && (state.value.endReached || (game.value.kind === 'tarot' && game.value.rules.kind === 'tarot' && game.value.rules.endMode === 'free' && game.value.deals.length > 0)))
const editable = computed(() => game.value?.status === 'in_progress')

async function run(fn: () => Promise<void>) {
  actionError.value = ''
  try { await fn() } catch (e) { actionError.value = e instanceof Error ? e.message : String(e) }
}
async function pass() {
  const g = game.value!
  const ok = await askConfirm({ title: 'Passer la donne ?', message: 'La donne est enregistrée sans mouvement de points et le donneur tourne.', confirmLabel: 'Passer la donne', danger: false })
  if (!ok) return
  await run(() => data.saveDeal(g.id, { id: crypto.randomUUID(), dealerId: state.value!.nextDealerId, passed: true, input: null, createdAt: new Date().toISOString() }))
}
async function finish() {
  await run(async () => {
    await data.setStatus(props.id, 'finished')
    await router.push(`/partie/${props.id}/resultat`)
  })
}
async function abandon() {
  if (await askConfirm({ title: 'Abandonner la partie ?', message: 'Elle reste dans l’historique mais ne compte pas dans les classements.', confirmLabel: 'Abandonner' }))
    await run(() => data.setStatus(props.id, 'abandoned'))
}
async function reopen() { await run(() => data.setStatus(props.id, 'in_progress')) }
async function removeDeal(dealId: string, n: number) {
  if (await askConfirm({ title: `Supprimer la donne ${n} ?`, message: 'Tous les scores, réserves et statistiques seront recalculés. Les donneurs des autres donnes ne changent pas.', confirmLabel: 'Supprimer' }))
    await run(() => data.deleteDeal(props.id, dealId))
}
async function removeGame() {
  if (await askConfirm({ title: 'Supprimer la partie ?', message: 'La partie et toutes ses donnes seront définitivement supprimées.', confirmLabel: 'Supprimer la partie' })) {
    await run(async () => { await data.deleteGame(props.id); await router.replace('/') })
  }
}
async function recompute() {
  if (await askConfirm({ title: 'Recalculer les donneurs ?', message: 'Le donneur de chaque donne sera recalculé depuis le premier donneur, en tournant à chaque donne.', confirmLabel: 'Recalculer', danger: false }))
    await run(() => data.recomputeDealers(props.id))
}
async function rename() {
  const n = window.prompt('Nom de la partie (laisser vide pour le nom automatique)', game.value!.name ?? '')
  if (n !== null) await run(() => data.renameGame(props.id, n))
}
const gapInfo = (d: number[]) => d.map((v, i) => ({ v, i }))
</script>

<template>
  <template v-if="game && state">
    <PageHeader :title="gameTitle(game)" :back="game.eveningId ? `/soiree/${game.eveningId}` : '/'" :back-label="game.eveningId ? 'Soirée' : 'Accueil'">
      <p class="muted">
        {{ game.status === 'in_progress' ? 'En cours' : game.status === 'finished' ? 'Terminée' : 'Abandonnée' }}
        <template v-if="game.rules.kind !== 'tarot'"> · objectif {{ game.rules.target }} · {{ game.rules.rounding === 'rounded' ? 'arrondi' : 'points réels' }}</template>
        <template v-else> · {{ game.rules.endMode === 'free' ? 'arrêt libre' : `fin à ±${game.rules.threshold}` }}</template>
        <button class="underline" @click="rename">Renommer</button>
      </p>
    </PageHeader>

    <section aria-label="Scores" class="mb-3 grid gap-2" :class="game.kind === 'tarot' ? 'grid-cols-1' : 'grid-cols-2'">
      <div v-for="(e, i) in entities" :key="i" class="card" :class="game.kind === 'tarot' ? 'flex items-center justify-between' : 'text-center'">
        <div>
          <p class="font-bold">{{ e.title }}</p>
          <p v-if="e.members && e.members !== e.title" class="muted">{{ e.members }}</p>
          <p v-if="game.kind === 'tarot' && state.nextRestingId === game.playerIds[i] && game.playerIds.length === 6" class="muted">Prochain donneur (au repos)</p>
        </div>
        <p class="text-4xl font-extrabold tabular-nums" :aria-label="`${e.title} : ${e.total} points`">{{ e.total }}</p>
      </div>
    </section>

    <p v-if="state.reserve.length" class="note mb-3">
      ⚖ Réserve de litige : {{ sum(state.reserve.map((r) => r.total)) }} points, attribués au gagnant de la prochaine donne sans litige.
    </p>
    <p v-if="state.endReached && editable" class="ok mb-3">
      <template v-if="game.kind === 'tarot'">Seuil atteint.</template><template v-else>Objectif atteint.</template> Vous pouvez terminer la partie.
    </p>
    <p v-if="hasDraft && editable" class="note mb-3">Un brouillon de donne est en cours de saisie.</p>
    <p v-if="editable" class="mb-3 text-base">
      Donneur suivant : <strong>{{ data.playerName(state.nextDealerId) }}</strong><span v-if="state.nextRestingId"> (au repos)</span>
    </p>
    <ErrorList :errors="actionError ? [actionError] : []" />

    <div class="mb-4 flex flex-col gap-2">
      <template v-if="editable">
        <RouterLink :to="`/partie/${id}/donne`" class="btn btn-primary !min-h-14 text-xl">{{ hasDraft ? 'Reprendre la saisie' : '＋ Saisir une donne' }}</RouterLink>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn" @click="pass">⏭ Donne passée</button>
          <button class="btn" :disabled="!undo" @click="run(() => data.undo(id))">↩ Annuler : {{ undo?.label ?? 'rien' }}</button>
        </div>
        <button v-if="canFinish" class="btn btn-primary" @click="finish">🏁 Terminer la partie</button>
      </template>
      <template v-else>
        <RouterLink v-if="game.status === 'finished'" :to="`/partie/${id}/resultat`" class="btn btn-primary">Voir le résultat</RouterLink>
        <button class="btn" @click="reopen">Rouvrir la partie</button>
      </template>
    </div>

    <section aria-labelledby="hist">
      <h2 id="hist" class="mb-2 text-xl font-bold">Donnes ({{ state.rows.length }})</h2>
      <p v-if="!state.rows.length" class="card muted">Aucune donne enregistrée.</p>
      <ol class="flex flex-col gap-2">
        <li v-for="row in [...state.rows].reverse()" :key="row.deal.id" class="card">
          <div class="flex items-baseline justify-between gap-2">
            <strong>Donne {{ row.index + 1 }}</strong>
            <span class="rounded-full border-2 border-slate-400 px-2 text-sm font-semibold">{{ outcomeLabel(row) }}</span>
          </div>
          <p class="muted">Donneur : {{ data.playerName(row.deal.dealerId) }}</p>
          <p class="my-1">{{ describeDeal(game, row.deal, names) }}</p>
          <p v-if="row.error" class="err">{{ row.error }}</p>
          <p v-else-if="!row.deal.passed" class="text-base">
            <template v-if="game.kind !== 'tarot'">
              <span v-for="(e, i) in entities" :key="i">{{ i ? ' · ' : '' }}{{ e.title }} <strong>{{ signed(row.delta[i]) }}</strong></span>
            </template>
            <template v-else>
              <span v-for="x in gapInfo(row.delta)" :key="x.i">{{ x.i ? ' · ' : '' }}{{ data.playerName(game.playerIds[x.i]) }} <strong>{{ signed(x.v) }}</strong></span>
            </template>
          </p>
          <p v-if="row.reserveCreated" class="muted">⚖ Réserve créée : {{ row.reserveCreated.total }}</p>
          <p v-if="row.reserveAwarded.length" class="muted">⚖ Réserve attribuée : {{ sum(row.reserveAwarded.map((r) => r.total)) }}</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <RouterLink v-if="!row.deal.passed" :to="`/partie/${id}/detail/${row.deal.id}`" class="btn flex-1">Détail du calcul</RouterLink>
            <RouterLink v-if="!row.deal.passed" :to="`/partie/${id}/donne/${row.deal.id}`" class="btn flex-1">Modifier</RouterLink>
            <button class="btn flex-1" @click="removeDeal(row.deal.id, row.index + 1)">Supprimer</button>
          </div>
        </li>
      </ol>
    </section>

    <section class="mt-6 flex flex-col gap-2">
      <button v-if="state.rows.length" class="btn" @click="recompute">Recalculer les donneurs</button>
      <button v-if="editable" class="btn" @click="abandon">Abandonner la partie</button>
      <button class="btn btn-danger" @click="removeGame">Supprimer la partie</button>
    </section>
  </template>
  <p v-else class="card">Partie introuvable. <RouterLink to="/" class="underline">Retour à l’accueil</RouterLink></p>
</template>
