<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import { useData } from '../stores/data'

const data = useData()
const name = ref('')
const error = ref('')
const list = computed(() => [...data.players].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
const dup = computed(() => data.similarPlayers(name.value))
async function add() {
  error.value = ''
  if (!name.value.trim()) {
    error.value = 'Saisissez un nom ou un pseudo.'
    return
  }
  const n = name.value
  name.value = ''
  try {
    await data.addPlayer(n)
  } catch (e) {
    name.value = n
    error.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <PageHeader title="Joueurs" back="/" back-label="Accueil" />
  <form class="card mb-4 flex flex-col gap-3" @submit.prevent="add">
    <label class="label" for="pn">Nouveau joueur</label>
    <input id="pn" v-model="name" class="input" placeholder="Nom ou pseudo" autocomplete="off" />
    <p v-if="dup.length" class="note">
      Un joueur nommé « {{ dup[0].name }} » existe déjà. Vous pouvez quand même créer un homonyme.
    </p>
    <p v-if="error" class="err" role="alert">{{ error }}</p>
    <button class="btn btn-primary">Ajouter</button>
  </form>
  <p v-if="!list.length" class="card muted">Aucun joueur.</p>
  <ul class="flex flex-col gap-2">
    <li v-for="p in list" :key="p.id">
      <RouterLink :to="`/joueur/${p.id}`" class="card block font-semibold">{{ p.name }}</RouterLink>
    </li>
  </ul>
</template>
