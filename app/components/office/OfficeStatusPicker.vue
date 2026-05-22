<script setup lang="ts">
import type { OfficeStatus } from '~~/app/types/office'

const props = defineProps<{ modelValue: OfficeStatus }>()
const emit = defineEmits<{ 'update:modelValue': [v: OfficeStatus] }>()

const items = [
  { value: 'available' as const, label: 'Available', icon: 'i-lucide-circle-check', color: 'text-emerald-500' },
  { value: 'busy' as const, label: 'Busy', icon: 'i-lucide-clock', color: 'text-amber-500' },
  { value: 'dnd' as const, label: 'Do not disturb', icon: 'i-lucide-bell-off', color: 'text-red-500' },
  { value: 'away' as const, label: 'Away', icon: 'i-lucide-moon', color: 'text-zinc-400' },
]
const current = computed(() => items.find((i) => i.value === props.modelValue)!)
</script>

<template>
  <UDropdownMenu
    :items="items.map((i) => ({
      label: i.label,
      icon: i.icon,
      onSelect: () => emit('update:modelValue', i.value),
    }))"
  >
    <UButton variant="ghost" size="sm" :icon="current.icon" :class="current.color">
      {{ current.label }}
    </UButton>
  </UDropdownMenu>
</template>
