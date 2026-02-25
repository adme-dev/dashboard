<template>
  <div class="grid grid-cols-2 gap-2">
    <button
      v-for="ct in columnTypes"
      :key="ct.id"
      class="flex items-center gap-3 p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-left"
      :class="modelValue === ct.id ? 'border-primary bg-primary/5' : ''"
      @click="$emit('update:modelValue', ct.id)"
    >
      <div
        class="w-8 h-8 rounded-lg flex items-center justify-center"
        :style="{ backgroundColor: ct.color + '20' }"
      >
        <UIcon :name="ct.icon" class="w-4 h-4" :style="{ color: ct.color }" />
      </div>
      <div>
        <span class="text-sm font-medium block">{{ ct.name }}</span>
        <span class="text-xs text-gray-500">{{ ct.description }}</span>
      </div>
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string
}>()

defineEmits<{
  'update:modelValue': [type: string]
}>()

const columnTypes = [
  { id: 'status', name: 'Status', icon: 'i-lucide-circle', color: '#00C875', description: 'Track progress' },
  { id: 'dropdown', name: 'Dropdown', icon: 'i-lucide-list', color: '#579BFC', description: 'Select from list' },
  { id: 'text', name: 'Text', icon: 'i-lucide-type', color: '#FFCC00', description: 'Free text' },
  { id: 'date', name: 'Date', icon: 'i-lucide-calendar', color: '#FF642E', description: 'Pick a date' },
  { id: 'people', name: 'People', icon: 'i-lucide-users', color: '#A25DDC', description: 'Assign members' },
  { id: 'number', name: 'Numbers', icon: 'i-lucide-hash', color: '#E2445C', description: 'Numeric values' },
  { id: 'checkbox', name: 'Checkbox', icon: 'i-lucide-check-square', color: '#00C875', description: 'Yes or no' },
  { id: 'timeline', name: 'Timeline', icon: 'i-lucide-gantt-chart', color: '#579BFC', description: 'Date range' },
  { id: 'rating', name: 'Rating', icon: 'i-lucide-star', color: '#FDAB3D', description: '1–5 stars' },
  { id: 'progress', name: 'Progress', icon: 'i-lucide-bar-chart', color: '#00C875', description: '0–100%' },
  { id: 'email', name: 'Email', icon: 'i-lucide-mail', color: '#579BFC', description: 'Email address' },
  { id: 'phone', name: 'Phone', icon: 'i-lucide-phone', color: '#A25DDC', description: 'Phone number' },
  { id: 'link', name: 'Link', icon: 'i-lucide-link', color: '#FF642E', description: 'URL link' },
  { id: 'currency', name: 'Currency', icon: 'i-lucide-dollar-sign', color: '#00C875', description: 'Money amount' },
  { id: 'tags', name: 'Tags', icon: 'i-lucide-tag', color: '#FFCC00', description: 'Multiple labels' },
  { id: 'color', name: 'Color', icon: 'i-lucide-palette', color: '#FF5AC4', description: 'Color picker' },
  { id: 'dependency', name: 'Dependency', icon: 'i-lucide-git-branch', color: '#784BD1', description: 'Link tasks' },
  { id: 'invoice_status', name: 'Invoice Status', icon: 'i-lucide-receipt', color: '#00C875', description: 'Billing status' },
]
</script>
