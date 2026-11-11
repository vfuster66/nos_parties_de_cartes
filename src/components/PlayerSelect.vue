<script setup lang="ts">
import { computed } from 'vue'
import { useData } from '../stores/data'

const props = defineProps<{
  label: string
  modelValue: string
  ids?: string[]
  exclude?: string[]
  placeholder?: string
  disabledIds?: string[]
  /** Boutons au lieu d'une liste déroulante : un seul toucher pour les choix fréquents (preneur, donneur). */
  tiles?: boolean
}>()
defineEmits<{ 'update:modelValue': [string] }>()
const data = useData()
const list = computed(() =>
  (props.ids
    ? props.ids.map((i) => data.player(i)!).filter(Boolean)
    : [...data.players].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  ).filter((p) => p.id === props.modelValue || !props.exclude?.includes(p.id)),
)
const id = `ps-${Math.random().toString(36).slice(2, 8)}`
</script>

<template>
  <fieldset v-if="tiles">
    <legend class="label">{{ label }}</legend>
    <div class="grid grid-cols-2 gap-2" role="radiogroup" :aria-label="label">
      <button
        v-for="p in list"
        :key="p.id"
        type="button"
        role="radio"
        :aria-checked="p.id === modelValue"
        :disabled="disabledIds?.includes(p.id)"
        class="btn justify-start !px-3"
        :class="p.id === modelValue ? 'btn-primary' : ''"
        @click="$emit('update:modelValue', p.id)"
      >
        <span aria-hidden="true">{{ p.id === modelValue ? '✓' : '' }}</span
        ><span class="truncate">{{ p.name }}</span>
      </button>
    </div>
  </fieldset>
  <div v-else>
    <label :for="id" class="label">{{ label }}</label>
    <select
      :id="id"
      class="input"
      :value="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">{{ placeholder ?? '— Choisir —' }}</option>
      <option v-for="p in list" :key="p.id" :value="p.id" :disabled="disabledIds?.includes(p.id)">{{ p.name }}</option>
    </select>
  </div>
</template>
