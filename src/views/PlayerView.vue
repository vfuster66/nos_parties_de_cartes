<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import StatsBlock from '../components/StatsBlock.vue'
import { askConfirm } from '../confirm'
import { partnersOf, playerParticipations } from '../engine/stats'
import { useData } from '../stores/data'

const props = defineProps<{ id: string }>()
const data = useData()
const router = useRouter()
const p = computed(() => data.player(props.id))
const parts = computed(() => playerParticipations(data.stats, props.id))
const partners = computed(() => partnersOf(data.stats, props.id))
const teams = computed(() => data.teams.filter((t) => t.memberIds.includes(props.id)))
const name = ref(p.value?.name ?? '')
const error = ref('')
const saved = ref(false)
const dup = computed(() => data.similarPlayers(name.value, props.id))
async function rename() {
  error.value = ''; saved.value = false
  if (!name.value.trim()) { error.value = 'Le nom ne peut pas être vide.'; return }
  try { await data.renamePlayer(props.id, name.value); saved.value = true } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
async function remove() {
  if (data.playerInGames(props.id)) { error.value = 'Ce joueur participe à des parties : il ne peut pas être supprimé.'; return }
  if (await askConfirm({ title: 'Supprimer le joueur ?', message: `${p.value!.name} sera supprimé définitivement.`, confirmLabel: 'Supprimer' })) {
    await data.deletePlayer(props.id); await router.replace('/joueurs')
  }
}
</script>

<template>
  <template v-if="p">
    <PageHeader :title="p.name" back="/joueurs" back-label="Joueurs" />
    <form class="card mb-4 flex flex-col gap-3" @submit.prevent="rename">
      <label class="label" for="rn">Nom ou pseudo</label>
      <input id="rn" v-model="name" class="input" />
      <p v-if="dup.length" class="note">Un autre joueur porte déjà ce nom (les homonymes restent autorisés).</p>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <p v-if="saved" class="ok" role="status">Nom enregistré. L’historique est conservé.</p>
      <button class="btn btn-primary">Renommer</button>
    </form>
    <section class="card mb-4"><h2 class="mb-2 text-xl font-bold">Statistiques</h2><StatsBlock :parts="parts" /></section>
    <section v-if="partners.length" class="card mb-4"><h2 class="mb-2 text-xl font-bold">Partenaires</h2>
      <ul class="list-disc pl-5"><li v-for="x in partners" :key="x.partnerId">{{ data.playerName(x.partnerId) }} — {{ x.played }} partie{{ x.played > 1 ? 's' : '' }}, {{ x.wins }} victoire{{ x.wins > 1 ? 's' : '' }}</li></ul></section>
    <section v-if="teams.length" class="card mb-4"><h2 class="mb-2 text-xl font-bold">Équipes</h2>
      <ul class="flex flex-col gap-1"><li v-for="t in teams" :key="t.id"><RouterLink :to="`/equipe/${t.id}`" class="underline">{{ data.teamName(t.id) }}</RouterLink></li></ul></section>
    <button class="btn btn-danger w-full" @click="remove">Supprimer ce joueur</button>
  </template>
  <p v-else class="card">Joueur introuvable.</p>
</template>
