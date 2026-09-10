<script setup lang="ts">
const emit = defineEmits<{ created: [] }>()
const { hasPermission, canWrite } = useAuth()
const canCreate = computed(() => canWrite.value && hasPermission('PAGE_STUDIO_EDIT'))
const toast = useToast()
const open = ref(false)
const saving = ref(false)
const message = ref<string | null>(null)
const form = reactive({ clientId: undefined as string | undefined, name: '', route: '', starterVersion: 'limousine-v1' })
const starters = [
  { label: 'Limousine and tours', value: 'limousine-v1' },
  { label: 'Floristry', value: 'floristry-v1' },
  { label: 'Retail', value: 'retail-v1' },
  { label: 'IT goods', value: 'it-goods-v1' },
  { label: 'Import and export', value: 'import-export-v1' }
]
const { data: clients, pending, error, refresh } = useFetch<Array<{ id: string, name: string, isActive: boolean }>>('/api/agency/clients', {
  immediate: false, server: false, watch: false, default: () => []
})
const clientOptions = computed(() => clients.value.filter(client => client.isActive).map(client => ({ label: client.name, value: client.id })))

async function start() {
  if (!canCreate.value) return
  message.value = null
  open.value = true
  await refresh()
}

function cancel() {
  if (!saving.value) open.value = false
}

async function save() {
  if (!canCreate.value || saving.value || pending.value || error.value) return
  message.value = null
  if (!clientOptions.value.some(client => client.value === form.clientId)) {
    message.value = 'Select an active client before creating the website.'
    return
  }
  const route = form.route.trim().toLowerCase()
  if (!form.name.trim() || !/^[a-z0-9](?:[a-z0-9-]{0,62})$/.test(route)) {
    message.value = 'Enter a website name and a route using letters, numbers and hyphens.'
    return
  }
  saving.value = true
  try {
    await $fetch('/api/agency/page-studio/sites', {
      method: 'POST',
      body: { clientId: form.clientId, name: form.name.trim(), route, starterVersion: form.starterVersion }
    })
    open.value = false
    form.clientId = undefined
    form.name = ''
    form.route = ''
    toast.add({ title: 'Website draft created', description: 'Open Manage site to continue setup. Publishing requires a reviewed version.', color: 'success' })
    emit('created')
  } catch (error: unknown) {
    const data = error && typeof error === 'object' && 'data' in error ? error.data : null
    message.value = data && typeof data === 'object' && 'statusMessage' in data
      ? String(data.statusMessage)
      : 'The website could not be created. Check the client subscription and site allowance, then try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UButton
    v-if="canCreate"
    label="New website"
    icon="i-lucide-plus"
    @click="start"
  />
  <UModal
    v-model:open="open"
    title="Create a client website"
    description="Choose the client and starter for a new website draft."
    :dismissible="!saving"
    scrollable
  >
    <template #body>
      <div class="grid grid-cols-1 gap-4">
        <UAlert
          v-if="error"
          color="error"
          title="Clients could not be loaded"
          description="Refresh the client list before continuing."
        >
          <template #actions>
            <UButton
              label="Retry clients"
              color="neutral"
              variant="outline"
              @click="refresh()"
            />
          </template>
        </UAlert>
        <UAlert
          v-if="message"
          color="error"
          title="Website could not be created"
          :description="message"
        />
        <UFormField label="Client" help="An active website subscription and available site allowance are required." required>
          <USelectMenu
            v-model="form.clientId"
            :items="clientOptions"
            value-key="value"
            placeholder="Select a client"
            :loading="pending"
            :disabled="saving || pending || Boolean(error)"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Website name" required>
          <UInput
            v-model="form.name"
            :disabled="saving"
            maxlength="160"
            placeholder="Fantasy Limo"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Site route" help="A unique workspace route. A custom domain is connected separately." required>
          <UInput
            v-model="form.route"
            :disabled="saving"
            maxlength="63"
            placeholder="fantasy-limo"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Starter template" required>
          <USelectMenu
            v-model="form.starterVersion"
            :items="starters"
            value-key="value"
            :disabled="saving"
            class="w-full"
          />
        </UFormField>
        <p class="text-sm leading-6 text-muted">
          This creates a draft workspace. Content setup, client access and a reviewed release are still required before the website can go live.
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="cancel"
        />
        <UButton
          label="Create draft"
          :loading="saving"
          :disabled="!canCreate || pending || Boolean(error)"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
