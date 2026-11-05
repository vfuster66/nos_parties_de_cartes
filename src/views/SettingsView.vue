<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import RulesEditor from '../components/RulesEditor.vue'
import SegmentedChoice from '../components/SegmentedChoice.vue'
import { askConfirm } from '../confirm'
import { migrate } from '../db/backup'
import type { BackupData, MergePlan } from '../db/backup'
import { GAME_LABELS } from '../engine/types'
import type { GameKind, Rules } from '../engine/types'
import { useData } from '../stores/data'

const data = useData()
const kind = ref<GameKind>('coinche')
const draft = ref<Rules>(JSON.parse(JSON.stringify(data.preferences.defaults.coinche)) as Rules)
const prefMsg = ref('')
const prefErr = ref('')
function pick(k: GameKind) {
  kind.value = k
  draft.value = JSON.parse(JSON.stringify(data.preferences.defaults[k])) as Rules
  prefMsg.value = ''
}
async function savePrefs() {
  prefMsg.value = ''
  prefErr.value = ''
  try {
    await data.setDefaultRules(kind.value, draft.value)
    prefMsg.value = 'Préférences enregistrées (pour les prochaines parties uniquement).'
  } catch (e) {
    prefErr.value = e instanceof Error ? e.message : String(e)
  }
}

// Export
function exportFile() {
  const blob = new Blob([data.exportJson()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `nos-parties-de-cartes-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

// Import
const importErrors = ref<string[]>([])
const incoming = ref<BackupData | null>(null)
const plan = ref<MergePlan | null>(null)
const choices = ref<Record<string, 'keep' | 'replace'>>({})
const importMsg = ref('')
async function onFile(e: Event) {
  importErrors.value = []
  importMsg.value = ''
  incoming.value = null
  plan.value = null
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  try {
    const text = await f.text()
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      importErrors.value = ['Ce fichier n’est pas du JSON valide.']
      return
    }
    const r = migrate(raw)
    if (!r.file) {
      importErrors.value = r.errors
      return
    }
    incoming.value = r.file.data
    plan.value = data.planImport(r.file.data)
    choices.value = Object.fromEntries(plan.value.conflicts.map((c) => [`${c.kind}:${c.id}`, 'keep' as const]))
  } catch (err) {
    importErrors.value = [err instanceof Error ? err.message : String(err)]
  }
}
async function doMerge() {
  if (!incoming.value) return
  const replace = new Set(
    Object.entries(choices.value)
      .filter(([, v]) => v === 'replace')
      .map(([k]) => k),
  )
  try {
    await data.importMerge(incoming.value, replace)
    importMsg.value = 'Import terminé et enregistré. Scores et statistiques sont recalculés à partir des donnes.'
    incoming.value = null
    plan.value = null
  } catch (err) {
    importErrors.value = [`Import annulé, aucune donnée modifiée : ${err instanceof Error ? err.message : String(err)}`]
  }
}
async function doReplace() {
  if (!incoming.value) return
  if (
    !(await askConfirm({
      title: 'Remplacer toutes les données ?',
      message: 'Vos données actuelles seront remplacées par celles du fichier. Pensez à exporter d’abord.',
      confirmLabel: 'Tout remplacer',
    }))
  )
    return
  try {
    await data.importReplaceAll(incoming.value)
    importMsg.value = 'Restauration terminée et enregistrée.'
    incoming.value = null
    plan.value = null
  } catch (err) {
    importErrors.value = [
      `Restauration annulée, aucune donnée modifiée : ${err instanceof Error ? err.message : String(err)}`,
    ]
  }
}
async function wipe() {
  if (
    await askConfirm({
      title: 'Effacer toutes les données ?',
      message: 'Joueurs, équipes, soirées, parties et préférences seront supprimés définitivement de ce navigateur.',
      confirmLabel: 'Tout effacer',
    })
  ) {
    try {
      await data.clearAll()
      importMsg.value = 'Toutes les données ont été effacées.'
    } catch {
      /* erreur affichée globalement */
    }
  }
}

// Installation (PWA)
interface InstallEvent extends Event {
  prompt: () => Promise<void>
}
const installEvt = ref<InstallEvent | null>(null)
const onPrompt = (e: Event) => {
  e.preventDefault()
  installEvt.value = e as InstallEvent
}
onMounted(() => window.addEventListener('beforeinstallprompt', onPrompt))
onBeforeUnmount(() => window.removeEventListener('beforeinstallprompt', onPrompt))
</script>

<template>
  <PageHeader title="Paramètres" back="/" back-label="Accueil" />

  <section class="card mb-4 flex flex-col gap-3" aria-labelledby="s-pref">
    <h2 id="s-pref" class="text-xl font-bold">Règles par défaut des nouvelles parties</h2>
    <SegmentedChoice
      :model-value="kind"
      label="Jeu"
      :options="(Object.keys(GAME_LABELS) as GameKind[]).map((k) => ({ value: k, label: GAME_LABELS[k] }))"
      @update:model-value="pick"
    />
    <RulesEditor v-model="draft" />
    <p v-if="prefErr" class="err" role="alert">{{ prefErr }}</p>
    <p v-if="prefMsg" class="ok" role="status">{{ prefMsg }}</p>
    <button class="btn btn-primary" @click="savePrefs">Enregistrer ces préférences</button>
    <p class="muted">
      Chaque partie conserve une copie de ses règles : changer les préférences ne modifie pas les parties existantes.
    </p>
  </section>

  <section class="card mb-4 flex flex-col gap-3" aria-labelledby="s-save">
    <h2 id="s-save" class="text-xl font-bold">Sauvegarde et restauration</h2>
    <ul class="list-disc pl-5 text-base">
      <li>Vos données restent dans ce navigateur, sur cet appareil : aucun compte, aucun serveur.</li>
      <li>Effacer les données du navigateur peut effacer tout l’historique.</li>
      <li>L’export JSON permet de sauvegarder ou de transférer vos données vers un autre appareil.</li>
    </ul>
    <button class="btn btn-primary" @click="exportFile">⬇ Exporter toutes les données (JSON)</button>

    <label class="label" for="imp">Importer une sauvegarde</label>
    <input id="imp" type="file" accept="application/json,.json" class="input !py-3" @change="onFile" />
    <div v-if="importErrors.length" class="err" role="alert">
      <ul class="list-disc pl-5">
        <li v-for="(m, i) in importErrors.slice(0, 8)" :key="i">{{ m }}</li>
      </ul>
      <p v-if="importErrors.length > 8">… et {{ importErrors.length - 8 }} autres problèmes.</p>
    </div>
    <p v-if="importMsg" class="ok" role="status">{{ importMsg }}</p>
    <div v-if="plan && incoming" class="flex flex-col gap-3">
      <p class="ok">
        Fichier valide. À ajouter : {{ plan.add.players.length }} joueur(s), {{ plan.add.teams.length }} équipe(s),
        {{ plan.add.evenings.length }} soirée(s), {{ plan.add.games.length }} partie(s). Éléments identiques ignorés :
        {{ plan.identical }}.
      </p>
      <fieldset v-for="c in plan.conflicts" :key="c.kind + c.id" class="rounded-xl border-2 border-amber-600 p-3">
        <legend class="px-1 font-bold">Conflit : {{ c.label }}</legend>
        <p class="muted">Un élément avec le même identifiant existe déjà mais son contenu diffère.</p>
        <SegmentedChoice
          v-model="choices[`${c.kind}:${c.id}`]"
          :label="`Que faire pour ${c.label} ?`"
          :options="[
            { value: 'keep', label: 'Garder l’existant' },
            { value: 'replace', label: 'Remplacer par l’import' },
          ]"
        />
      </fieldset>
      <button class="btn btn-primary" @click="doMerge">Fusionner avec mes données</button>
      <button class="btn btn-danger" @click="doReplace">Remplacer toutes mes données</button>
    </div>
  </section>

  <section class="card mb-4 flex flex-col gap-2" aria-labelledby="s-inst">
    <h2 id="s-inst" class="text-xl font-bold">Installation et hors connexion</h2>
    <p class="text-base">
      Après un premier chargement réussi, l’application fonctionne sans connexion. Vous pouvez l’installer sur l’écran
      d’accueil quand votre navigateur le permet.
    </p>
    <button v-if="installEvt" class="btn btn-primary" @click="installEvt.prompt()">Installer l’application</button>
    <p v-else class="muted">
      Installation non proposée par ce navigateur pour le moment (sur iPhone : Partager → Sur l’écran d’accueil).
    </p>
  </section>

  <button class="btn btn-danger w-full" @click="wipe">Effacer toutes les données</button>
</template>
