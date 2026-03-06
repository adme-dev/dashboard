<script setup lang="ts">
const emit = defineEmits<{
  select: [fieldType: string]
}>()

const fieldCategories = [
  {
    name: 'Text',
    types: [
      { type: 'text', label: 'Text Input', icon: 'i-lucide-type' },
      { type: 'textarea', label: 'Text Area', icon: 'i-lucide-align-left' },
      { type: 'richtext', label: 'Rich Text', icon: 'i-lucide-file-text' },
      { type: 'email', label: 'Email', icon: 'i-lucide-mail' },
      { type: 'url', label: 'URL', icon: 'i-lucide-link' },
      { type: 'phone', label: 'Phone', icon: 'i-lucide-phone' }
    ]
  },
  {
    name: 'Number',
    types: [
      { type: 'number', label: 'Number', icon: 'i-lucide-hash' },
      { type: 'currency', label: 'Currency', icon: 'i-lucide-dollar-sign' },
      { type: 'rating', label: 'Rating', icon: 'i-lucide-star' }
    ]
  },
  {
    name: 'Selection',
    types: [
      { type: 'dropdown', label: 'Dropdown', icon: 'i-lucide-chevron-down' },
      { type: 'multiselect', label: 'Multi-select', icon: 'i-lucide-list-checks' },
      { type: 'radio', label: 'Radio', icon: 'i-lucide-circle-dot' },
      { type: 'checkbox', label: 'Checkbox', icon: 'i-lucide-square-check' },
      { type: 'checkboxgroup', label: 'Checkbox Group', icon: 'i-lucide-check-square' }
    ]
  },
  {
    name: 'Date & Time',
    types: [
      { type: 'date', label: 'Date', icon: 'i-lucide-calendar' },
      { type: 'datetime', label: 'Date & Time', icon: 'i-lucide-calendar-clock' },
      { type: 'time', label: 'Time', icon: 'i-lucide-clock' },
      { type: 'daterange', label: 'Date Range', icon: 'i-lucide-calendar-range' }
    ]
  },
  {
    name: 'Media',
    types: [
      { type: 'file', label: 'File Upload', icon: 'i-lucide-paperclip' },
      { type: 'files', label: 'Multiple Files', icon: 'i-lucide-files' },
      { type: 'image', label: 'Image', icon: 'i-lucide-image' },
      { type: 'images', label: 'Multiple Images', icon: 'i-lucide-images' },
      { type: 'color', label: 'Color Picker', icon: 'i-lucide-palette' }
    ]
  },
  {
    name: 'Layout',
    types: [
      { type: 'heading', label: 'Heading', icon: 'i-lucide-heading' },
      { type: 'paragraph', label: 'Paragraph', icon: 'i-lucide-text' },
      { type: 'divider', label: 'Divider', icon: 'i-lucide-minus' }
    ]
  },
  {
    name: 'Relations',
    types: [
      { type: 'client', label: 'Client', icon: 'i-lucide-building' },
      { type: 'project', label: 'Project', icon: 'i-lucide-folder-kanban' },
      { type: 'department', label: 'Department', icon: 'i-lucide-building-2' },
      { type: 'user', label: 'User', icon: 'i-lucide-user' },
      { type: 'users', label: 'Multiple Users', icon: 'i-lucide-users' }
    ]
  }
]
</script>

<template>
  <div class="space-y-4">
    <div v-for="category in fieldCategories" :key="category.name">
      <p class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
        {{ category.name }}
      </p>
      <div class="grid grid-cols-2 gap-1.5">
        <button
          v-for="ft in category.types"
          :key="ft.type"
          type="button"
          class="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors hover:bg-elevated border border-transparent hover:border-default"
          @click="emit('select', ft.type)"
        >
          <UIcon :name="ft.icon" class="size-4 text-muted shrink-0" />
          <span class="truncate">{{ ft.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
