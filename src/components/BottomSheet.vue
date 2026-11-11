<script setup lang="ts">
// Feuille modale en bas d'écran : scores, historique, dernier pli… consultables sans quitter la table.
import { nextTick, onMounted, ref } from 'vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
const closeBtn = ref<HTMLButtonElement | null>(null)
onMounted(() => nextTick(() => closeBtn.value?.focus()))
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <div
      class="anim-sheet flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-paper shadow-2xl sm:rounded-3xl"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <header class="flex items-center justify-between gap-2 border-b border-stone-300 px-4 py-3">
        <h2 class="text-xl font-bold">{{ title }}</h2>
        <button ref="closeBtn" class="btn !min-h-11" type="button" data-testid="sheet-close" @click="emit('close')">
          Fermer
        </button>
      </header>
      <div class="overflow-y-auto px-4 py-3 pb-6"><slot /></div>
    </div>
  </div>
</template>
