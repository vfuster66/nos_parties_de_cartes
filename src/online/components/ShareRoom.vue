<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatCode } from '../../../shared/protocol'

const props = defineProps<{ code: string }>()
const copied = ref<string | null>(null)
// Le lien ne contient que le code du salon : jamais de secret de reconnexion.
const link = computed(() => `${location.origin}${import.meta.env.BASE_URL}#/en-ligne/rejoindre/${props.code}`)

async function copy(what: 'lien' | 'code', text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = what
  } catch {
    copied.value = null
    window.prompt('Copiez :', text)
  }
  setTimeout(() => (copied.value = null), 2500)
}
async function share(): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Coinche en ligne',
        text: `Rejoins ma partie de coinche (code ${formatCode(props.code)})`,
        url: link.value,
      })
      return
    } catch {
      /* annulé : on retombe sur la copie */
    }
  }
  await copy('lien', link.value)
}
</script>

<template>
  <div class="card flex flex-col gap-2">
    <p class="muted">Code du salon</p>
    <p class="break-all text-3xl font-bold tracking-widest" data-testid="room-code">{{ formatCode(code) }}</p>
    <div class="grid grid-cols-2 gap-2">
      <button class="btn" data-testid="copy-link" @click="share">Partager le lien</button>
      <button class="btn" @click="copy('code', formatCode(code))">Copier le code</button>
    </div>
    <p v-if="copied" class="ok" role="status">{{ copied === 'lien' ? 'Lien copié.' : 'Code copié.' }}</p>
    <p class="muted text-sm">Le lien ouvre le salon mais ne réserve aucune place.</p>
  </div>
</template>
