<script setup lang="ts">
import { idempotencyKey } from '~~/app/utils/idempotencyKey'
import { computed, ref, watch } from 'vue'

interface ClientOption {
  id: string
  name: string
}

interface SearchAuthoritySite {
  id: string
  clientId: string
  clientName?: string
  canonicalHostname: string
  contentHostname: string | null
  status: string
}

const props = defineProps<{
  clients: ClientOption[]
  sites: SearchAuthoritySite[]
  loading: boolean
}>()

const emit = defineEmits<{
  configured: [site: SearchAuthoritySite]
}>()

const toast = useToast()
const selectedClientId = ref<string | null>(null)
const canonicalHostname = ref('')
const contentHostname = ref('')
const saving = ref(false)

const clientOptions = computed(() => props.clients.map(client => ({
  label: client.name,
  value: client.id
})))
const selectedSite = computed(() => props.sites.find(
  site => site.clientId === selectedClientId.value
))
const canConfigure = computed(() => (
  Boolean(selectedClientId.value)
  && Boolean(canonicalHostname.value.trim())
  && !saving.value
))

watch(selectedClientId, () => {
  canonicalHostname.value = selectedSite.value?.canonicalHostname || ''
  contentHostname.value = selectedSite.value?.contentHostname || ''
})

function errorMessage(error: unknown): string {
  const candidate = error as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  } | null
  return candidate?.data?.statusMessage
    || candidate?.statusMessage
    || candidate?.message
    || 'The site could not be configured'
}

async function configureSite() {
  if (!canConfigure.value || !selectedClientId.value) return
  saving.value = true

  try {
    const response = await $fetch<{ site: SearchAuthoritySite }>(
      '/api/agency/search-authority/sites',
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey('search-authority-site') },
        body: {
          clientId: selectedClientId.value,
          canonicalHostname: canonicalHostname.value.trim(),
          contentHostname: contentHostname.value.trim() || null
        }
      }
    )
    emit('configured', response.site)
    canonicalHostname.value = response.site.canonicalHostname
    contentHostname.value = response.site.contentHostname || ''
    toast.add({
      title: 'Site ready',
      description: 'Search Authority access is ready for Search Console connection.',
      color: 'success'
    })
  } catch (error: unknown) {
    toast.add({
      title: 'Site setup failed',
      description: errorMessage(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-3">
          <div class="rounded-lg bg-primary/10 p-2 text-primary">
            <UIcon name="i-lucide-globe-2" class="size-5" />
          </div>
          <div>
            <h2 class="font-semibold text-highlighted">
              Site readiness
            </h2>
            <p class="mt-1 text-sm text-muted">
              Define the public website roots XeroFlow is allowed to assess.
            </p>
          </div>
        </div>
        <UBadge
          v-if="selectedSite"
          label="Configured"
          color="success"
          variant="subtle"
        />
      </div>
    </template>

    <div v-if="loading" class="space-y-4" aria-label="Loading site readiness">
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-10 w-full" />
    </div>

    <UAlert
      v-else-if="clients.length === 0"
      title="No accessible clients"
      description="You need access to an active agency client before configuring Search Authority."
      icon="i-lucide-building-2"
      color="neutral"
      variant="subtle"
    />

    <form v-else class="@container space-y-5" @submit.prevent="configureSite">
      <UAlert
        title="Pilot activation"
        description="Saving this form starts a cancellable trial entitlement for the selected client. It does not publish or modify the client website."
        icon="i-lucide-flask-conical"
        color="primary"
        variant="subtle"
      />

      <div class="grid grid-cols-1 gap-4">
        <UFormField
          label="Client"
          help="Choose the dealership or client this evidence workspace belongs to."
          required
        >
          <USelectMenu
            v-model="selectedClientId"
            :items="clientOptions"
            value-key="value"
            placeholder="Choose a client"
            class="w-full"
            data-testid="search-authority-client"
          />
        </UFormField>

        <UFormField
          label="Canonical website hostname"
          help="The public root domain Search Console and technical checks should treat as canonical."
          required
        >
          <UInput
            v-model="canonicalHostname"
            class="w-full"
            placeholder="www.client-domain.com.au"
            autocomplete="url"
            data-testid="search-authority-canonical-hostname"
          />
        </UFormField>

        <UFormField
          label="XeroFlow content hostname"
          help="Optional. Add the separate XeroFlow-owned hostname if publishing will run beside the dealer CMS."
        >
          <UInput
            v-model="contentHostname"
            class="w-full"
            placeholder="content.client-domain.com.au"
            autocomplete="url"
            data-testid="search-authority-content-hostname"
          />
        </UFormField>
      </div>

      <div class="flex justify-end">
        <UButton
          type="submit"
          :label="selectedSite ? 'Update site' : 'Configure site'"
          icon="i-lucide-check"
          :loading="saving"
          :disabled="!canConfigure"
          data-testid="configure-search-authority-site"
        />
      </div>
    </form>
  </UCard>
</template>
