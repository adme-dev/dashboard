<script setup lang="ts">
const props = defineProps<{
  modelValue: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const contactFetch = $fetch as <T>(request: string) => Promise<T>

interface XeroStatus {
  connected: boolean
  selectedTenantId: string | null
}

// Fetch Xero contacts
const xeroData = ref<{ contacts: any[]; count: number }>({ contacts: [], count: 0 })
const pending = ref(false)
const connected = ref<boolean | null>(null)
const connectionMessage = ref('')

onMounted(async () => {
  pending.value = true
  try {
    const status = await contactFetch<XeroStatus>('/api/xero/status')
    connected.value = status.connected
    if (!status.connected) {
      connectionMessage.value = 'Connect Xero and select an organisation to link this client to a contact.'
      return
    }
    xeroData.value = await contactFetch<{ contacts: any[]; count: number }>('/api/xero/contacts')
  } catch {
    connected.value = false
    connectionMessage.value = 'Xero contacts are temporarily unavailable. Try again after checking the Xero connection.'
  } finally {
    pending.value = false
  }
})

const contacts = computed(() => xeroData.value.contacts || [])

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
      :disabled="connected === false"
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

    <UAlert
      v-if="!pending && connectionMessage"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :description="connectionMessage"
    />

    <p v-else-if="!pending && connected && contacts.length === 0" class="text-xs text-muted">
      No Xero contacts were found in the selected organisation.
    </p>
  </div>
</template>
