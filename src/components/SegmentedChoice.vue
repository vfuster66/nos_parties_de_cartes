<script setup lang="ts" generic="T extends string | number">
// Groupe de boutons exclusifs (radio) : l'état est indiqué par une coche, pas seulement par la couleur.
defineProps<{ label: string; options: { value: T; label: string }[]; modelValue: T }>()
defineEmits<{ 'update:modelValue': [T] }>()
</script>

<template>
  <fieldset>
    <legend class="label">{{ label }}</legend>
    <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="label">
      <button
        v-for="o in options"
        :key="String(o.value)"
        type="button"
        role="radio"
        :aria-checked="o.value === modelValue"
        class="btn flex-1"
        :class="o.value === modelValue ? 'btn-primary' : ''"
        @click="$emit('update:modelValue', o.value)"
      >
        <span aria-hidden="true">{{ o.value === modelValue ? '✓' : '' }}</span
        >{{ o.label }}
      </button>
    </div>
  </fieldset>
</template>
