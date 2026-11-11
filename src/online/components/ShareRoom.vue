<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatCode } from '../../../shared/protocol'

const props = defineProps<{ code: string; title?: string }>()
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
        title: props.title ?? 'Partie en ligne',
        text: `Rejoins ma partie (${props.title ?? 'cartes'}) : code ${formatCode(props.code)}`,
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
  <section class="card flex flex-col gap-2 !border-gold !border-2 !bg-gold-soft/40" aria-label="Inviter des joueurs">
    <p class="eyebrow">Invitez les autres joueurs</p>
    <p
      class="break-all text-center text-4xl font-bold tracking-[0.2em]"
      data-testid="room-code"
      aria-label="Code du salon"
    >
      {{ formatCode(code) }}
    </p>
    <button class="btn btn-primary !min-h-14 text-lg" data-testid="copy-link" @click="share">
      📤 Partager le lien
    </button>
    <div class="grid grid-cols-2 gap-2">
      <button class="btn" @click="copy('lien', link)">Copier le lien</button>
      <button class="btn" @click="copy('code', formatCode(code))">Copier le code</button>
    </div>
    <p v-if="copied" class="ok" role="status">{{ copied === 'lien' ? '✓ Lien copié.' : '✓ Code copié.' }}</p>
    <p class="muted text-center text-sm">Le lien ouvre le salon mais ne réserve aucune place.</p>
  </section>
</template>
