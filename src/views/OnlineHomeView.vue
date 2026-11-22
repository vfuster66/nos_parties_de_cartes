<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { OnlineGame } from '../../shared/coinche/types'
import { formatCode } from '../../shared/protocol'
import { onlineEnabled } from '../online/config'
import { lastNickname, linkResult, loadResults, loadSessions } from '../online/local'
import type { OnlineResult } from '../online/local'
import { useOnline } from '../online/store'
import type { GameKind } from '../engine/types'
import { useData } from '../stores/data'
import PageHeader from '../components/PageHeader.vue'

const props = defineProps<{ code?: string }>()
const online = useOnline()
const data = useData()
const router = useRouter()
const nickname = ref(lastNickname())
const game = ref<OnlineGame>('coinche')
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
const linking = ref<string | null>(null)
const picks = ref<Record<number, string>>({})
const linkError = ref('')
const linkBusy = ref(false)

function resultKind(r: OnlineResult): GameKind {
  if (r.game === 'tarot' || r.formula?.startsWith('tarot')) return 'tarot'
  if (r.formula === 'belote' || r.formula === 'belote-annonces' || r.name.toLowerCase().includes('belote'))
    return 'belote'
  return 'coinche'
}
function openLink(r: OnlineResult): void {
  linking.value = r.roomId
  linkError.value = ''
  const next: Record<number, string> = {}
  for (const p of r.players) next[p.seat] = data.similarPlayers(p.nickname)[0]?.id ?? ''
  picks.value = next
}
async function confirmLink(r: OnlineResult): Promise<void> {
  linkError.value = ''
  const kind = resultKind(r)
  const count = kind === 'tarot' ? r.totals.length : 4
  const chosen: string[] = []
  for (let seat = 0; seat < count; seat++) {
    const nick = r.players.find((p) => p.seat === seat)?.nickname
    if (!nick) {
      linkError.value = 'Il manque un joueur pour une place.'
      return
    }
    const id = picks.value[seat] ?? ''
    if (id && chosen.includes(id)) {
      linkError.value = 'Deux places ne peuvent pas être le même joueur.'
      return
    }
    if (id) chosen.push(id)
  }
  linkBusy.value = true
  try {
    const playerIds: string[] = []
    for (let seat = 0; seat < count; seat++) {
      const nick = r.players.find((p) => p.seat === seat)!.nickname
      playerIds.push(picks.value[seat] || (await data.addPlayer(nick)).id)
    }
    const game = await data.adoptOnlineResult({
      name: r.name,
      kind,
      announcements: r.formula !== 'belote',
      status: r.status,
      endedAt: r.endedAt,
      rounds: r.rounds,
      roomId: r.roomId,
      totals: r.totals,
      playerIds,
      teamNames: r.game === 'tarot' ? undefined : r.teamNames,
    })
    linkResult(r.roomId, game.id)
    results.value = loadResults()
    linking.value = null
    await router.push(`/partie/${game.id}`)
  } catch (e) {
    linkError.value = e instanceof Error ? e.message : String(e)
  } finally {
    linkBusy.value = false
  }
}
</script>

<template>
  <PageHeader title="Jouer en ligne" back="/" back-label="Accueil" />
  <p v-if="!onlineEnabled" class="note" role="status">
    Le jeu en ligne n’est pas disponible : aucun serveur n’est configuré.
  </p>
  <template v-else>
    <div class="mb-3 flex flex-wrap gap-1.5" aria-label="Jeu en ligne">
      <span class="badge">3–6 joueurs</span>
      <span class="badge">Sans compte</span>
    </div>
    <div v-if="online.error" class="err mb-3" role="alert">{{ online.error }}</div>

    <section v-if="existing" class="card mb-3">
      <p class="mb-2 font-semibold">Vous avez déjà une place dans ce salon.</p>
      <RouterLink :to="`/en-ligne/salon/${existing.roomId}`" class="btn btn-primary w-full"
        >Reprendre ma place</RouterLink
      >
    </section>

    <section class="card mb-3 !p-3">
      <label class="label" for="nick">Votre pseudo</label>
      <input id="nick" v-model="nickname" class="input" maxlength="20" autocomplete="nickname" data-testid="nickname" />
      <p class="muted mt-1 text-sm">20 caractères maximum.</p>
    </section>

    <form v-if="!code" class="card mb-3 flex flex-col gap-3 !border-2 !border-teal-700" @submit.prevent>
      <h2 class="text-xl font-bold">① Créer un salon</h2>
      <div>
        <label for="online-game" class="label">Jeu</label>
        <select id="online-game" v-model="game" class="input">
          <option value="coinche">Coinche (4 joueurs)</option>
          <option value="belote">Belote sans annonces (4 joueurs)</option>
          <option value="belote-annonces">Belote avec annonces (4 joueurs)</option>
          <option value="tarot-3">Tarot à trois</option>
          <option value="tarot">Tarot à quatre</option>
          <option value="tarot-5">Tarot à cinq</option>
          <option value="tarot-6">Tarot à six</option>
        </select>
      </div>
      <button
        class="btn btn-primary !min-h-14 text-lg"
        type="submit"
        :disabled="!nickOk || busy"
        data-testid="create-room"
        @click="create"
      >
        {{ busy ? 'Création…' : 'Créer un salon privé' }}
      </button>
    </form>

    <form class="card mb-3 flex flex-col gap-3" :class="code ? '!border-2 !border-teal-700' : ''" @submit.prevent>
      <h2 class="text-xl font-bold">{{ code ? 'Rejoindre ce salon' : '② Rejoindre avec un code' }}</h2>
      <div>
        <label class="label" for="code">Code du salon</label>
        <input
          id="code"
          v-model="code"
          class="input text-center text-2xl font-bold uppercase tracking-widest"
          maxlength="12"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          placeholder="ABCD-EFGH"
          data-testid="room-code-input"
        />
      </div>
      <button
        class="btn !min-h-14 text-lg"
        :class="code ? 'btn-primary' : ''"
        type="submit"
        :disabled="!nickOk || code.trim().length < 4 || busy"
        data-testid="join-room"
        @click="join"
      >
        Rejoindre{{ code ? ' le salon' : ' avec ce code' }}
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
          <RouterLink
            v-if="r.linkedGameId && data.game(r.linkedGameId)"
            :to="`/partie/${r.linkedGameId}`"
            class="btn mt-2 w-full"
            >Voir dans le compteur</RouterLink
          >
          <button v-else class="btn mt-2 w-full" type="button" data-testid="link-online" @click="openLink(r)">
            Relier aux joueurs du compteur
          </button>
          <form
            v-if="linking === r.roomId"
            class="mt-2 flex flex-col gap-2"
            data-testid="link-online-form"
            @submit.prevent="confirmLink(r)"
          >
            <p class="text-sm">Chaque pseudo devient un joueur. Un nom déjà connu est proposé.</p>
            <label v-for="p in [...r.players].sort((a, b) => a.seat - b.seat)" :key="p.seat" class="text-sm">
              Place {{ p.seat + 1 }} · {{ p.nickname }}
              <select v-model="picks[p.seat]" class="input mt-1">
                <option value="">Nouveau joueur : {{ p.nickname }}</option>
                <option v-for="pl in data.players" :key="pl.id" :value="pl.id">{{ pl.name }}</option>
              </select>
            </label>
            <p v-if="linkError" class="err" role="alert">{{ linkError }}</p>
            <button class="btn btn-primary" type="submit" :disabled="linkBusy">
              {{ linkBusy ? 'Enregistrement…' : 'Ajouter aux classements' }}
            </button>
          </form>
        </li>
      </ul>
      <p class="muted mt-2 text-sm">
        Relier une partie recopie son score dans le compteur. Les donnes, elles, restent sur la table.
      </p>
    </section>
  </template>
</template>
