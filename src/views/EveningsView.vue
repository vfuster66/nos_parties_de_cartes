<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import { frDate } from '../labels'
import { todayIso, useData } from '../stores/data'

const data = useData()
const router = useRouter()
const name = ref('')
const date = ref(todayIso())
const error = ref('')
const list = computed(() => [...data.evenings].sort((a, b) => b.date.localeCompare(a.date)))
async function create() {
  error.value = ''
  if (!date.value) { error.value = 'Indiquez la date de la soirée.'; return }
  try {
    const e = await data.addEvening(name.value, date.value)
    await router.push(`/soiree/${e.id}`)
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
</script>

<template>
  <PageHeader title="Soirées" back="/" backLabel="Accueil" />
  <form class="card mb-4 flex flex-col gap-3" @submit.prevent="create">
    <h2 class="text-xl font-bold">Nouvelle soirée</h2>
    <div><label class="label" for="en">Nom (facultatif)</label><input id="en" v-model="name" class="input" placeholder="Vendredi chez Virginie" /></div>
    <div><label class="label" for="ed">Date</label><input id="ed" v-model="date" type="date" class="input" /></div>
    <p v-if="error" class="err" role="alert">{{ error }}</p>
    <button class="btn btn-primary">Créer la soirée</button>
  </form>
  <p v-if="!list.length" class="card muted">Aucune soirée.</p>
  <ul class="flex flex-col gap-2">
    <li v-for="e in list" :key="e.id">
      <RouterLink :to="`/soiree/${e.id}`" class="card block">
        <strong>{{ e.name || 'Soirée' }}</strong>
        <p class="muted">{{ frDate(e.date) }} · {{ data.eveningGames(e.id).length }} partie{{ data.eveningGames(e.id).length > 1 ? 's' : '' }}</p>
      </RouterLink>
    </li>
  </ul>
</template>
