<script setup lang="ts">
import { answerConfirm, confirmState as s } from '../confirm'
</script>

<template>
  <div v-if="s.open" class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
    <div
      class="card w-full max-w-md"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-msg"
    >
      <h2 id="confirm-title" class="text-xl font-bold">{{ s.title }}</h2>
      <p id="confirm-msg" class="my-3">{{ s.message }}</p>
      <div class="flex flex-col gap-2">
        <button class="btn" :class="s.danger ? 'btn-danger' : 'btn-primary'" @click="answerConfirm(true)">
          {{ s.confirmLabel }}
        </button>
        <button class="btn" autofocus @click="answerConfirm(false)">Annuler</button>
      </div>
    </div>
  </div>
</template>
