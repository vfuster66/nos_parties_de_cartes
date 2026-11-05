<script setup lang="ts">
import { RouterLink } from 'vue-router'
defineProps<{ title: string; back?: string; backLabel?: string }>()
</script>

<template>
  <header class="mb-3">
    <RouterLink v-if="back" :to="back" class="btn mb-2 !min-h-11">← {{ backLabel ?? 'Retour' }}</RouterLink>
    <h1 class="text-2xl font-bold">{{ title }}</h1>
    <slot />
  </header>
</template>
