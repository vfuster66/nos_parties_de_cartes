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
  <div>
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
