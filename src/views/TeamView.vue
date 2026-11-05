<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import StatsBlock from '../components/StatsBlock.vue'
import { teamParticipations } from '../engine/stats'
import { useData } from '../stores/data'

const props = defineProps<{ id: string }>()
const data = useData()
const t = computed(() => data.team(props.id))
const parts = computed(() => teamParticipations(data.stats, props.id))
const name = ref(t.value?.name ?? '')
const error = ref('')
const saved = ref(false)
async function rename() {
  error.value = ''
  saved.value = false
  try {
    await data.renameTeam(props.id, name.value)
    saved.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <template v-if="t">
    <PageHeader :title="data.teamName(t.id)" back="/equipes" back-label="Équipes">
      <p class="muted">
        Membres :
        <RouterLink v-for="(m, i) in t.memberIds" :key="m" :to="`/joueur/${m}`" class="underline"
          >{{ i ? ' & ' : '' }}{{ data.playerName(m) }}</RouterLink
        >
      </p>
    </PageHeader>
    <form class="card mb-4 flex flex-col gap-3" @submit.prevent="rename">
      <label class="label" for="tn">Nom de l’équipe (vide = noms des joueurs)</label>
      <input id="tn" v-model="name" class="input" />
      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <p v-if="saved" class="ok" role="status">Nom enregistré. L’historique est conservé.</p>
      <button class="btn btn-primary">Renommer</button>
      <p class="muted">
        Changer un membre crée une autre équipe : choisissez simplement d’autres joueurs lors d’une nouvelle partie.
      </p>
    </form>
    <section class="card">
      <h2 class="mb-2 text-xl font-bold">Statistiques</h2>
      <StatsBlock :parts="parts" />
    </section>
  </template>
  <p v-else class="card">Équipe introuvable.</p>
</template>
