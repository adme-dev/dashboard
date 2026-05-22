<script setup lang="ts">
import type { OfficeRow } from '~~/app/types/office'

const props = defineProps<{
  offices: (OfficeRow & { my_role: string })[]
  modelValue: string | null
}>()
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()

const items = computed(() =>
  props.offices.map((o) => ({
    label: o.name,
    onSelect: () => emit('update:modelValue', o.id),
  })),
)
const current = computed(() => props.offices.find((o) => o.id === props.modelValue))
</script>

<template>
  <UDropdownMenu v-if="offices.length > 1" :items="items">
    <UButton variant="ghost" size="sm" trailing-icon="i-lucide-chevron-down">
      {{ current?.name || 'Select office' }}
    </UButton>
  </UDropdownMenu>
  <div v-else-if="current" class="text-sm font-medium px-3">{{ current.name }}</div>
</template>
