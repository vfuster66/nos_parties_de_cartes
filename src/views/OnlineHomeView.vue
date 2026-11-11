<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { formatCode } from '../../shared/protocol'
import { onlineEnabled } from '../online/config'
import { lastNickname, loadResults, loadSessions } from '../online/local'
import type { OnlineResult } from '../online/local'
import { useOnline } from '../online/store'
import PageHeader from '../components/PageHeader.vue'

const props = defineProps<{ code?: string }>()
const online = useOnline()
const router = useRouter()
const nickname = ref(lastNickname())
const game = ref<'coinche' | 'belote' | 'belote-annonces' | 'tarot'>('coinche')
const code = ref(props.code ?? '')
const busy = ref(false)
const sessions = ref(Object.values(loadSessions()).sort((a, b) => b.savedAt - a.savedAt))
const results = ref<OnlineResult[]>(loadResults())
onMounted(() => {
  online.error = null
})
const nickOk = computed(() => nickname.value.trim().length >= 1 && nickname.value.trim().length <= 20)
const existing = computed(() =>
  sessions.value.find((s) => props.code && s.code === props.code.toUpperCase().replace(/[^A-Z0-9]/g, '')),
)

async function create(): Promise<void> {
  busy.value = true
  const id = await online.createRoom(nickname.value, game.value)
  busy.value = false
  if (id) await router.push(`/en-ligne/salon/${id}`)
}
async function join(): Promise<void> {
  busy.value = true
  const id = await online.joinRoom(code.value, nickname.value)
  busy.value = false
  if (id) await router.push(`/en-ligne/salon/${id}`)
}
const when = (t: number) => new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
</script>

<template>
  <PageHeader title="Jouer en ligne" back="/" back-label="Accueil" />
  <p v-if="!onlineEnabled" class="note" role="status">
    Le jeu en ligne n’est pas disponible : aucun serveur n’est configuré.
  </p>
  <template v-else>
    <p class="muted mb-3">
      Coinche, belote ou tarot à quatre joueurs, chacun sur son téléphone. Aucun compte : un pseudo suffit.
    </p>
    <div v-if="online.error" class="err mb-3" role="alert">{{ online.error }}</div>

    <section v-if="existing" class="card mb-3">
      <p class="mb-2 font-semibold">Vous avez déjà une place dans ce salon.</p>
      <RouterLink :to="`/en-ligne/salon/${existing.roomId}`" class="btn btn-primary w-full"
        >Reprendre ma place</RouterLink
      >
    </section>

    <form class="card mb-3 flex flex-col gap-3" @submit.prevent>
      <div>
        <label class="label" for="nick">Votre pseudo</label>
        <input
          id="nick"
          v-model="nickname"
          class="input"
          maxlength="20"
          autocomplete="nickname"
          data-testid="nickname"
        />
        <p class="muted mt-1 text-sm">Affiché aux autres joueurs, 20 caractères maximum.</p>
      </div>
      <label v-if="!code" class="label">
        Jeu
        <select v-model="game" class="input">
          <option value="coinche">Coinche</option>
          <option value="belote">Belote sans annonces</option>
          <option value="belote-annonces">Belote avec annonces</option>
          <option value="tarot">Tarot à quatre</option>
        </select>
      </label>
      <button
        v-if="!code"
        class="btn btn-primary !min-h-14"
        type="submit"
        :disabled="!nickOk || busy"
        data-testid="create-room"
        @click="create"
      >
        Créer un salon privé
      </button>
      <div>
        <label class="label" for="code">Code du salon</label>
        <input
          id="code"
          v-model="code"
          class="input uppercase tracking-widest"
          maxlength="12"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          placeholder="ABCD-EFGH"
          data-testid="room-code-input"
        />
      </div>
      <button
        class="btn !min-h-14"
        :class="code ? 'btn-primary' : ''"
        type="submit"
        :disabled="!nickOk || code.trim().length < 4 || busy"
        data-testid="join-room"
        @click="join"
      >
        Rejoindre avec ce code
      </button>
    </form>

    <section v-if="sessions.length" class="card mb-3" aria-labelledby="mine">
      <h2 id="mine" class="mb-2 text-xl font-bold">Mes salons</h2>
      <ul class="flex flex-col gap-2">
        <li v-for="s in sessions" :key="s.roomId">
          <RouterLink :to="`/en-ligne/salon/${s.roomId}`" class="btn w-full justify-between">
            <span>{{ formatCode(s.code) }} · {{ s.nickname }}</span
            ><span class="muted">{{ when(s.savedAt) }}</span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <section v-if="results.length" class="card" aria-labelledby="res">
      <h2 id="res" class="mb-2 text-xl font-bold">Mes parties en ligne</h2>
      <ul class="flex flex-col gap-2">
        <li v-for="r in results" :key="r.roomId" class="rounded-xl border border-slate-200 p-2">
          <p class="font-semibold">
            {{ r.name }} <span class="muted">· {{ when(r.endedAt) }}</span>
          </p>
          <ul v-if="r.game === 'tarot'">
            <li v-for="p in [...r.players].sort((a, b) => r.totals[b.seat] - r.totals[a.seat])" :key="p.seat">
              {{ p.nickname }} · {{ r.totals[p.seat] }} pts
            </li>
          </ul>
          <p v-else>{{ r.teamNames[0] }} {{ r.totals[0] }} — {{ r.totals[1] }} {{ r.teamNames[1] }}</p>
          <p v-if="r.status === 'abandoned'" class="muted">Abandonnée (aucune victoire)</p>
          <p v-else-if="r.game !== 'tarot' && r.myTeam != null" class="font-semibold">
            {{ r.winnerTeam === r.myTeam ? '🏆 Victoire' : 'Défaite' }}
          </p>
          <p class="muted text-sm">{{ r.players.map((p) => p.nickname).join(', ') }}</p>
        </li>
      </ul>
      <p class="muted mt-2 text-sm">
        Résultats conservés sur cet appareil. Ils ne sont pas rattachés à vos joueurs locaux ni à vos statistiques.
      </p>
    </section>
  </template>
</template>
