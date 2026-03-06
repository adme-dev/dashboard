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

// Build items for USelectMenu — let searchable handle filtering
const contactItems = computed(() => {
  return contacts.value.map((c: any) => ({
    label: c.name,
    value: c.id,
    description: c.email || ''
  }))
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
      :items="contactItems"
      value-key="value"
      placeholder="Search Xero contacts..."
      searchable
      :loading="pending"
      class="w-full"
      size="xl"
      @update:model-value="handleSelect"
    />

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

    <p v-if="!pending && contacts.length === 0" class="text-[12px] text-[var(--ui-text-muted)]">
      No Xero contacts found. Ensure Xero is connected.
    </p>
  </div>
</template>
