<script setup lang="ts">
import { idempotencyKey } from '~/utils/idempotencyKey'
import type { FetchError } from 'ofetch'

const props = defineProps<{ disabled?: boolean }>()
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ creating: [value: boolean] }>()
const { canWrite, hasRole } = useAuth()
const toast = useToast()
const { data: clientsData } = await useFetch<{ id: string, name: string }[]>('/api/agency/qr-codes/clients', { key: 'qr-clients' })
const clients = computed(() => (clientsData.value ?? []).map(c => ({ label: c.name, value: c.id })))
const searchTerm = ref('')
const menuOpen = ref(false)
const creating = ref(false)
const attempt = ref<{ name: string, key: string } | null>(null)
const canCreateClient = computed(() => canWrite.value && hasRole(['owner', 'admin', 'sales']))
const matchingClient = (name: string) => clientsData.value?.find(c => c.name.toLowerCase() === name.trim().toLowerCase())
const createItem = computed(() => canCreateClient.value && !props.disabled && !creating.value
  && !!searchTerm.value.trim() && !matchingClient(searchTerm.value)
  ? 'always' as const
  : false)

async function createClient(input: string) {
  const name = input.trim()
  if (!name || !canCreateClient.value || props.disabled || creating.value) return
  const existing = matchingClient(name)
  if (existing) {
    model.value = existing.id
    menuOpen.value = false
    searchTerm.value = ''
    return
  }
  if (attempt.value?.name !== name) attempt.value = { name, key: idempotencyKey('qr-client-create') }
  creating.value = true
  emit('creating', true)
  try {
    const client = await $fetch<{ id: string, name: string }>('/api/agency/clients', {
      method: 'POST', body: { name }, headers: { 'Idempotency-Key': attempt.value.key }
    })
    clientsData.value = [...(clientsData.value ?? []).filter(c => c.id !== client.id), { id: client.id, name: client.name }]
      .sort((a, b) => a.name.localeCompare(b.name))
    model.value = client.id
    menuOpen.value = false
    searchTerm.value = ''
    attempt.value = null
    toast.add({ title: 'Client added', description: `${client.name} is selected for this QR code.`, color: 'success' })
  } catch (e) {
    toast.add({ title: 'Could not add client', description: (e as FetchError)?.data?.statusMessage ?? 'Try again or add the client from Clients.', color: 'error' })
  } finally {
    creating.value = false
    emit('creating', false)
  }
}
</script>

<template>
  <div class="space-y-2">
    <USelectMenu
      v-model="model"
      v-model:open="menuOpen"
      v-model:search-term="searchTerm"
      :items="clients"
      value-key="value"
      :disabled="disabled || creating"
      :loading="creating"
      :create-item="createItem"
      :search-input="{ placeholder: canCreateClient && !disabled ? 'Find or add a client…' : 'Find a client…' }"
      placeholder="Select client"
      class="w-full"
      @create="createClient"
    >
      <template #create-item-label>
        Add client “{{ searchTerm.trim() }}”
      </template>
    </USelectMenu>
    <p v-if="!disabled" class="text-xs text-muted">
      {{ canCreateClient ? 'Type an unlisted name to add it to Clients and select it here.' : 'Client not listed? Ask an administrator to add it.' }}
    </p>
  </div>
</template>
