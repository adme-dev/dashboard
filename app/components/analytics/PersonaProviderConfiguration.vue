<script setup lang="ts">
type Provider = 'google_ads' | 'meta'

type ProviderReadiness = {
  provider: Provider
  identityEntitlement: boolean
  audienceEntitlement: boolean
  clientAuthorization: boolean
  connectionReady: boolean
  providerConfigured: boolean
  termsAccepted: boolean
  emergencyStopped: boolean
  globalWritesEnabled: boolean
  requestReady: boolean
  dispatchReady: boolean
}

type ActivationResponse = {
  providerReadiness?: ProviderReadiness[]
}

const route = useRoute()
const apiFetch = $fetch as (request: string, options?: Record<string, any>) => Promise<any>
const clientId = computed(() => String(route.params.id || route.query.clientId || ''))
const loading = ref(false)
const saving = ref<Provider | null>(null)
const error = ref('')
const readiness = ref<ProviderReadiness[]>([])
const selectedProvider = ref<Provider>('google_ads')
const reason = ref('')
const acceptProviderTerms = ref(false)

const providerLabel = (provider: Provider) => provider === 'google_ads' ? 'Google Ads' : 'Meta'

async function refresh() {
  if (!clientId.value) return

  loading.value = true
  error.value = ''
  try {
    const response = await apiFetch('/api/agency/analytics/personas/activations', {
      query: { clientId: clientId.value },
    }) as ActivationResponse
    readiness.value = response.providerReadiness || []
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.message || 'Provider readiness is unavailable'
  } finally {
    loading.value = false
  }
}

async function persist(mode: 'stage' | 'suspend' | 'stop' | 'resume') {
  if (!clientId.value || reason.value.trim().length < 3) {
    error.value = 'Add a reason of at least three characters for the audit trail.'
    return
  }

  const current = readiness.value.find(item => item.provider === selectedProvider.value)
  const stage = mode === 'stage' || mode === 'resume'

  saving.value = selectedProvider.value
  error.value = ''
  try {
    await apiFetch('/api/agency/analytics/personas/provider-settings', {
      method: 'PUT',
      body: {
        clientId: clientId.value,
        provider: selectedProvider.value,
        entitlementStatus: mode === 'suspend' ? 'suspended' : 'active',
        enabled: stage,
        emergencyStop: mode === 'stop',
        acceptProviderTerms: acceptProviderTerms.value && !current?.termsAccepted,
        reason: reason.value.trim(),
      },
    })
    reason.value = ''
    acceptProviderTerms.value = false
    await refresh()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.message || 'Provider configuration failed'
  } finally {
    saving.value = null
  }
}

onMounted(refresh)
watch(clientId, refresh)
</script>

<template>
  <section class="mt-6 overflow-hidden rounded-xl border border-default bg-default">
    <div class="flex flex-col gap-2 border-b border-default px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 class="text-sm font-semibold text-highlighted">Audience activation controls</h3>
        <p class="mt-1 text-xs text-muted">
          Agency configuration only. Client authorization remains a separate portal action.
        </p>
      </div>
      <UButton
        type="button"
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        @click="refresh"
      >
        Refresh
      </UButton>
    </div>

    <div class="grid gap-3 p-5 lg:grid-cols-2">
      <button
        v-for="item in readiness"
        :key="item.provider"
        type="button"
        class="rounded-lg border p-4 text-left transition-colors"
        :class="selectedProvider === item.provider
          ? 'border-primary bg-primary/5'
          : 'border-default bg-elevated/40 hover:border-accented'"
        @click="selectedProvider = item.provider"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm font-medium text-highlighted">{{ providerLabel(item.provider) }}</span>
          <UBadge :color="item.dispatchReady ? 'success' : item.requestReady ? 'warning' : 'neutral'" variant="subtle">
            {{ item.dispatchReady ? 'Live' : item.requestReady ? 'Awaiting client' : 'Setup required' }}
          </UBadge>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
          <span>Entitlement: {{ item.audienceEntitlement ? 'Active' : 'Missing' }}</span>
          <span>Connection: {{ item.connectionReady ? 'Ready' : 'Missing' }}</span>
          <span>Terms: {{ item.termsAccepted ? 'Accepted' : 'Required' }}</span>
          <span>Client consent: {{ item.clientAuthorization ? 'Granted' : 'Required' }}</span>
        </div>
      </button>
    </div>

    <div class="border-t border-default px-5 py-4">
      <div class="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <label class="mb-1.5 block text-xs font-medium text-muted">Change reason</label>
          <UInput
            v-model="reason"
            class="w-full"
            placeholder="Required for the append-only audit trail"
          />
          <label class="mt-3 flex items-start gap-2 text-xs text-muted">
            <input v-model="acceptProviderTerms" type="checkbox" class="mt-0.5">
            <span>I confirm the agency has accepted the selected provider's audience terms.</span>
          </label>
        </div>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            type="button"
            color="neutral"
            variant="outline"
            :loading="saving === selectedProvider"
            @click="persist('suspend')"
          >
            Suspend
          </UButton>
          <UButton
            type="button"
            color="error"
            variant="soft"
            :loading="saving === selectedProvider"
            @click="persist('stop')"
          >
            Emergency stop
          </UButton>
          <UButton
            type="button"
            :loading="saving === selectedProvider"
            @click="persist('stage')"
          >
            Stage provider
          </UButton>
        </div>
      </div>
      <p v-if="error" class="mt-3 text-xs text-error">{{ error }}</p>
    </div>
  </section>
</template>
