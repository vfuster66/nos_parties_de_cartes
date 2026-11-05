<script setup lang="ts">
defineProps<{ errors: string[] }>()
</script>

<template>
  <div v-if="errors.length" class="err" role="alert">
    <ul class="list-disc pl-5"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
  </div>
</template>
