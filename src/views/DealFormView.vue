<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BeloteFields from '../components/BeloteFields.vue'
import CoincheFields from '../components/CoincheFields.vue'
import DealBreakdown from '../components/DealBreakdown.vue'
import ErrorList from '../components/ErrorList.vue'
import PageHeader from '../components/PageHeader.vue'
import PlayerSelect from '../components/PlayerSelect.vue'
import TarotFields from '../components/TarotFields.vue'
import { askConfirm } from '../confirm'
import { activeFor, computeGame } from '../engine/game'
import type { Deal } from '../engine/model'
import { beloteFromForm, coincheFromForm, emptyForm, inputToForm, tarotFromForm } from '../forms'
import type { BeloteForm, CoincheForm, DealForm, TarotForm } from '../forms'
import { useData } from '../stores/data'

const props = defineProps<{ id: string; dealId?: string }>()
const data = useData()
const router = useRouter()
const game = computed(() => data.game(props.id))
const existing = computed(() => game.value?.deals.find((d) => d.id === props.dealId))
const dealIndex = computed(() => game.value?.deals.findIndex((d) => d.id === props.dealId) ?? -1)

const form = ref<DealForm>(emptyForm(game.value?.kind ?? 'coinche'))
const dealerId = ref('')
const draftRestored = ref(false)
const saving = ref(false)
const saveError = ref('')
let loaded = false

function init() {
  const g = game.value
  if (!g) return
  const ex = existing.value
  form.value = ex?.input ? inputToForm(g, ex.input) : emptyForm(g.kind)
  dealerId.value = ex?.dealerId ?? computeGame(g).nextDealerId
  const draft = data.getDraft(g.id, props.dealId ?? null)
  if (draft) {
    const d = draft.form as { form: DealForm; dealerId: string }
    form.value = d.form
    dealerId.value = d.dealerId
    draftRestored.value = true
  }
  loaded = true
}
init()

let timer: number | undefined
watch(
  [form, dealerId],
  () => {
    if (!loaded) return
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      void data
        .saveDraft(props.id, props.dealId ?? null, { form: form.value, dealerId: dealerId.value })
        .catch(() => undefined)
    }, 400)
  },
  { deep: true },
)
onBeforeUnmount(() => window.clearTimeout(timer))

const active = computed(() => (game.value ? activeFor(game.value, dealerId.value) : []))
const parsed = computed(() => {
  const g = game.value!
  if (g.kind === 'coinche') return coincheFromForm(g, form.value as CoincheForm)
  if (g.kind === 'belote') return beloteFromForm(g, form.value as BeloteForm)
  return tarotFromForm(form.value as TarotForm, active.value.length)
})
const candidate = computed<Deal | null>(() =>
  parsed.value.input
    ? {
        id: existing.value?.id ?? 'preview',
        dealerId: dealerId.value,
        passed: false,
        input: parsed.value.input,
        createdAt: existing.value?.createdAt ?? '',
      }
    : null,
)
const preview = computed(() => {
  const g = game.value
  if (!g || !candidate.value) return null
  const deals = [...g.deals]
  if (existing.value) deals[dealIndex.value] = candidate.value
  else deals.push(candidate.value)
  const rows = computeGame({ ...g, deals }).rows
  return rows[existing.value ? dealIndex.value : rows.length - 1]
})
const liveDelta = computed(() => {
  const g = game.value
  const row = preview.value
  if (!g || !row) return []
  const delta = row.teamDetail?.delta ?? row.tarotDetail?.delta ?? []
  return delta.map((d, i) => ({
    label: row.teamDetail ? data.gameTeamName(g, i as 0 | 1) : data.playerName(g.playerIds[i]),
    value: d > 0 ? `+${d}` : String(d),
  }))
})
const errors = computed(() =>
  parsed.value.errors.length ? parsed.value.errors : preview.value?.error ? [preview.value.error] : [],
)

async function save() {
  if (!candidate.value || errors.value.length || saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    const deal: Deal = {
      ...candidate.value,
      id: existing.value?.id ?? crypto.randomUUID(),
      createdAt: existing.value?.createdAt ?? new Date().toISOString(),
    }
    await data.saveDeal(props.id, deal)
    await data.deleteDraft(props.id, props.dealId ?? null)
    await router.replace(`/partie/${props.id}`)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}
async function discard() {
  if (
    await askConfirm({
      title: 'Effacer le brouillon ?',
      message: 'Les valeurs saisies seront perdues.',
      confirmLabel: 'Effacer',
    })
  ) {
    window.clearTimeout(timer)
    await data.deleteDraft(props.id, props.dealId ?? null).catch(() => undefined)
    await router.replace(`/partie/${props.id}`)
  }
}
</script>

<template>
  <template v-if="game && (!dealId || existing)">
    <PageHeader
      :title="existing ? `Modifier la donne ${dealIndex + 1}` : 'Nouvelle donne'"
      :back="`/partie/${id}`"
      back-label="Tableau des scores"
    />
    <p v-if="draftRestored" class="ok mb-3">Brouillon restauré : vous reprenez votre saisie.</p>
    <p v-if="existing" class="note mb-3">
      Après validation, toutes les donnes suivantes (scores, réserves, résultat, statistiques) seront recalculées.
    </p>
    <form class="flex flex-col gap-4" @submit.prevent="save">
      <details class="rounded-xl border border-stone-300 bg-white px-3 py-2">
        <summary class="cursor-pointer text-base font-semibold">
          Donneur : <span class="font-bold">{{ data.playerName(dealerId) }}</span>
          <span class="muted !text-sm"> · changer</span>
        </summary>
        <div class="mt-2">
          <PlayerSelect v-model="dealerId" label="Donneur de cette donne" :ids="game.playerIds" tiles />
        </div>
      </details>
      <p v-if="game.playerIds.length === 6" class="note">
        Le donneur est au repos : il ne peut être ni preneur, ni appelé, ni bénéficiaire de prime.
      </p>
      <CoincheFields v-if="game.kind === 'coinche'" v-model="form as CoincheForm" :game="game" />
      <BeloteFields v-else-if="game.kind === 'belote'" v-model="form as BeloteForm" :game="game" />
      <TarotFields v-else v-model="form as TarotForm" :active="active" />

      <section class="card" aria-labelledby="prev-h" aria-live="polite">
        <h2 id="prev-h" class="mb-2 text-xl font-bold">Résultat de la donne</h2>
        <ErrorList :errors="errors" />
        <template v-if="preview && !errors.length">
          <p class="grid grid-cols-2 gap-2 text-center" data-testid="live-result">
            <span v-for="(d, i) in liveDelta" :key="i" class="rounded-xl bg-teal-50 p-2">
              <span class="block truncate text-sm">{{ d.label }}</span>
              <span class="block text-2xl font-bold">{{ d.value }}</span>
            </span>
          </p>
          <details class="mt-2">
            <summary class="btn w-full">🔎 Détail du calcul</summary>
            <div class="mt-2"><DealBreakdown :game="game" :row="preview" /></div>
          </details>
        </template>
        <p v-else-if="!errors.length" class="muted">Remplissez la donne pour voir le calcul.</p>
      </section>

      <p v-if="saveError" class="err" role="alert">{{ saveError }}</p>
      <div class="sticky bottom-[3.75rem] z-10 -mx-3 border-t border-slate-300 bg-slate-50/95 px-3 py-2">
        <button class="btn btn-primary !min-h-14 w-full text-xl" :disabled="!!errors.length || !candidate || saving">
          {{ existing ? 'Enregistrer la correction' : 'Valider la donne' }}
        </button>
      </div>
      <button type="button" class="btn" @click="discard">Effacer le brouillon et quitter</button>
    </form>
  </template>
  <p v-else class="card">Donne introuvable.</p>
</template>
