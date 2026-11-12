<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { formatCode } from '../../../shared/protocol'

const props = defineProps<{ code: string; title?: string }>()
const feedback = ref('')
const manualLink = ref(false)
let feedbackTimer: ReturnType<typeof setTimeout> | undefined
// Le lien ne contient que le code du salon : jamais de secret de reconnexion.
const link = computed(() => `${location.origin}${import.meta.env.BASE_URL}#/en-ligne/rejoindre/${props.code}`)

function showFeedback(message: string): void {
  feedback.value = message
  if (feedbackTimer) clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => (feedback.value = ''), 3500)
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.append(field)
    try {
      field.select()
      return typeof document.execCommand === 'function' && document.execCommand('copy')
    } catch {
      return false
    } finally {
      field.remove()
    }
  }
}

async function copy(what: 'lien' | 'code', text: string): Promise<void> {
  if (await copyText(text)) {
    showFeedback(what === 'lien' ? '✓ Lien copié' : '✓ Code copié')
    return
  }
  if (what === 'lien') manualLink.value = true
  showFeedback(what === 'lien' ? 'Sélectionnez le lien pour le copier' : 'Copie indisponible')
}

async function share(): Promise<void> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: props.title ?? 'Partie en ligne',
        text: `${props.title ?? 'Partie de cartes'} · Code ${formatCode(props.code)}`,
        url: link.value,
      })
      showFeedback('✓ Partage effectué')
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  if (await copyText(link.value)) showFeedback('Partage indisponible · lien copié')
  else {
    manualLink.value = true
    showFeedback('Partage indisponible · sélectionnez le lien')
  }
}

onBeforeUnmount(() => {
  if (feedbackTimer) clearTimeout(feedbackTimer)
})
</script>

<template>
  <section class="card flex flex-col gap-3 !border-2 !border-gold !bg-gold-soft/40" aria-label="Inviter des joueurs">
    <div class="flex items-center justify-between gap-2">
      <p class="eyebrow">Inviter</p>
      <button
        class="btn min-h-11 !px-3"
        aria-label="Copier le code du salon"
        data-testid="copy-code"
        @click="copy('code', formatCode(code))"
      >
        ⧉ Code
      </button>
    </div>
    <p class="break-all text-center text-3xl font-extrabold tracking-[0.16em]" data-testid="room-code">
      {{ formatCode(code) }}
    </p>
    <div class="grid grid-cols-2 gap-2">
      <button class="btn btn-primary !min-h-14" data-testid="share-link" @click="share">↗ Envoyer le lien</button>
      <button class="btn !min-h-14" data-testid="copy-link" @click="copy('lien', link)">⧉ Copier le lien</button>
    </div>
    <input
      v-if="manualLink"
      class="input text-sm"
      :value="link"
      readonly
      aria-label="Lien du salon à copier manuellement"
      @focus="($event.target as HTMLInputElement).select()"
    />
    <p v-if="feedback" class="text-center text-sm font-semibold" role="status" aria-live="polite">{{ feedback }}</p>
  </section>
</template>
