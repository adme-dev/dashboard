<script setup lang="ts">
const props = defineProps<{
  modelValue: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

// Fetch Xero contacts
const { data: xeroData, pending } = useLazyFetch('/api/xero/contacts', {
  default: () => ({ contacts: [], count: 0 })
})

const contacts = computed(() => (xeroData.value as any)?.contacts || [])

// Build items for USelectMenu
const contactItems = computed(() => {
  return contacts.value.map((c: any) => ({
    label: c.name,
    value: c.id,
    description: c.email || ''
  }))
})

// Search filter
const searchQuery = ref('')

const filteredItems = computed(() => {
  if (!searchQuery.value) return contactItems.value
  const q = searchQuery.value.toLowerCase()
  return contactItems.value.filter((item: any) =>
    item.label.toLowerCase().includes(q) ||
    item.description?.toLowerCase().includes(q)
  )
})

// Current selection label
const selectedLabel = computed(() => {
  if (!props.modelValue) return ''
  const found = contactItems.value.find((c: any) => c.value === props.modelValue)
  return found?.label || props.modelValue
})

const handleSelect = (value: string | null) => {
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="space-y-2">
    <USelectMenu
      :model-value="modelValue"
      :items="filteredItems"
      value-key="value"
      placeholder="Search Xero contacts..."
      searchable
      :search-input="searchQuery"
      :loading="pending"
      @update:model-value="handleSelect"
      @update:search-input="searchQuery = $event"
    >
      <template #item="{ item }">
        <div>
          <p class="font-medium">{{ item.label }}</p>
          <p v-if="item.description" class="text-xs text-gray-500">{{ item.description }}</p>
        </div>
      </template>
    </USelectMenu>

    <div v-if="modelValue" class="flex items-center gap-2">
      <UBadge color="info" variant="subtle" size="sm">
        <UIcon name="i-lucide-link" class="w-3 h-3 mr-1" />
        {{ selectedLabel }}
      </UBadge>
      <UButton
        variant="ghost"
        size="xs"
        color="neutral"
        icon="i-lucide-x"
        @click="handleSelect(null)"
      />
    </div>
  </div>
</template>
