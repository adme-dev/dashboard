<script setup lang="ts">
import type { OfficeStatus } from '~~/app/types/office'

const props = defineProps<{ modelValue: OfficeStatus }>()
const emit = defineEmits<{ 'update:modelValue': [v: OfficeStatus] }>()

interface StatusItem {
  value: OfficeStatus
  label: string
  icon: string
  dot: string
}

const items: StatusItem[] = [
  { value: 'available', label: 'Available', icon: 'i-lucide-circle-check', dot: 'bg-emerald-500' },
  { value: 'busy', label: 'Busy', icon: 'i-lucide-clock', dot: 'bg-amber-500' },
  { value: 'dnd', label: 'Do not disturb', icon: 'i-lucide-bell-off', dot: 'bg-red-500' },
  { value: 'away', label: 'Away', icon: 'i-lucide-moon', dot: 'bg-zinc-400' }
]
const current = computed(() => items.find(i => i.value === props.modelValue)!)
</script>

<template>
  <UDropdownMenu
    :items="items.map(i => ({
      label: i.label,
      icon: i.icon,
      onSelect: () => emit('update:modelValue', i.value)
    }))"
  >
    <UButton
      variant="soft"
      color="neutral"
      size="sm"
      class="gap-2"
    >
      <span
        class="size-2 rounded-full ring-2 ring-default"
        :class="current.dot"
      />
      <span class="font-medium">{{ current.label }}</span>
      <UIcon name="i-lucide-chevron-down" class="size-3.5 opacity-60" />
    </UButton>
  </UDropdownMenu>
</template>
