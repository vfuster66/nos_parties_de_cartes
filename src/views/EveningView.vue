<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import GameCard from '../components/GameCard.vue'
import PageHeader from '../components/PageHeader.vue'
import RankTable from '../components/RankTable.vue'
import { askConfirm } from '../confirm'
import { playerRanking } from '../engine/stats'
import { GAME_LABELS } from '../engine/types'
import type { GameKind } from '../engine/types'
import { frDate } from '../labels'
import { useData } from '../stores/data'

const props = defineProps<{ id: string }>()
const data = useData()
const router = useRouter()
const ev = computed(() => data.evening(props.id))
const games = computed(() => data.eveningGames(props.id))
const kinds = computed(() => (Object.keys(GAME_LABELS) as GameKind[]).filter((k) => games.value.some((g) => g.kind === k && g.status === 'finished')))
const rankings = computed(() => kinds.value.map((k) => ({ kind: k, rows: playerRanking(data.stats, k, props.id) })))
const overall = computed(() => playerRanking(data.stats, null, props.id))
const editing = ref(false)
const form = ref({ name: ev.value?.name ?? '', date: ev.value?.date ?? '' })
const error = ref('')
const loose = computed(() => data.games.filter((g) => !g.eveningId))

async function saveEdit() {
  error.value = ''
  if (!form.value.date) { error.value = 'Indiquez la date.'; return }
  try { await data.updateEvening(props.id, form.value.name, form.value.date); editing.value = false } catch (e) { error.value = String(e instanceof Error ? e.message : e) }
}
async function remove() {
  if (await askConfirm({ title: 'Supprimer la soirée ?', message: 'Ses parties sont conservées comme parties indépendantes.', confirmLabel: 'Supprimer la soirée' })) {
    await data.deleteEvening(props.id)
    await router.replace('/soirees')
  }
}
async function attach(e: Event) {
  const gid = (e.target as HTMLSelectElement).value
  if (gid) await data.moveGameToEvening(gid, props.id)
}
</script>

<template>
  <template v-if="ev">
    <PageHeader :title="ev.name || 'Soirée'" back="/soirees" back-label="Soirées"><p class="muted">{{ frDate(ev.date) }}</p></PageHeader>
    <div class="mb-4 flex flex-col gap-2">
      <RouterLink :to="{ path: '/nouvelle', query: { evening: id } }" class="btn btn-primary !min-h-14">＋ Ajouter une partie à cette soirée</RouterLink>
      <button class="btn" @click="editing = !editing">Modifier le nom ou la date</button>
    </div>
    <form v-if="editing" class="card mb-4 flex flex-col gap-3" @submit.prevent="saveEdit">
      <div><label class="label" for="en">Nom</label><input id="en" v-model="form.name" class="input" /></div>
      <div><label class="label" for="ed">Date</label><input id="ed" v-model="form.date" type="date" class="input" /></div>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <button class="btn btn-primary">Enregistrer</button>
    </form>

    <section class="mb-4" aria-labelledby="pg"><h2 id="pg" class="mb-2 text-xl font-bold">Parties ({{ games.length }})</h2>
      <p v-if="!games.length" class="card muted">Aucune partie dans cette soirée.</p>
      <div class="flex flex-col gap-2"><GameCard v-for="g in games" :key="g.id" :game="g" /></div>
      <div v-if="loose.length" class="mt-2">
        <label class="label" for="att">Rattacher une partie indépendante</label>
        <select id="att" class="input" @change="attach"><option value="">— Choisir une partie —</option><option v-for="g in loose" :key="g.id" :value="g.id">{{ g.name || g.autoName }}</option></select>
      </div>
    </section>

    <section class="mb-4" aria-labelledby="cl"><h2 id="cl" class="mb-2 text-xl font-bold">Classement de la soirée</h2>
      <p v-if="!rankings.length" class="card muted">Aucune partie terminée.</p>
      <div v-for="r in rankings" :key="r.kind" class="card mb-2"><h3 class="mb-1 font-bold">{{ GAME_LABELS[r.kind] }}</h3><RankTable :rows="r.rows" :caption="`Classement ${GAME_LABELS[r.kind]}`" link-base="/joueur" /></div>
      <div v-if="kinds.length > 1" class="card">
        <h3 class="font-bold">Bilan tous jeux confondus</h3>
        <p class="note my-2">Ce bilan mélange plusieurs jeux : il n’additionne aucun score, seulement participations et victoires.</p>
        <RankTable :rows="overall" caption="Bilan tous jeux" link-base="/joueur" />
      </div>
    </section>
    <button class="btn btn-danger w-full" @click="remove">Supprimer la soirée</button>
  </template>
  <p v-else class="card">Soirée introuvable.</p>
</template>
