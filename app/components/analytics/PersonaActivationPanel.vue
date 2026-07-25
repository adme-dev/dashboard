<script setup lang="ts">
interface ActivationItem {
  id: string
  provider: 'google_ads' | 'meta'
  name: string
  estimatedSize: number
  minimumSize: number
  status: string
  blockedReason: string | null
  expiresAt: string
  privacyApprovedBy: string | null
  liveApprovedBy: string | null
}

interface ProviderReadiness {
  provider: 'google_ads' | 'meta'
  identityEntitlement: string
  audienceEntitlement: string
  clientAuthorization: string
  connectionReady: boolean
  providerConfigured: boolean
  termsAccepted: boolean
  emergencyStopped: boolean
  globalWritesEnabled: boolean
  validatedAt: string | null
  lastError: string | null
  requestReady: boolean
  dispatchReady: boolean
}

const props = defineProps<{
  clientId: string
  startDate: string
  endDate: string
  platform?: string
  campaignId?: string
}>()

const provider = ref<'google_ads' | 'meta'>(
  props.platform?.toLowerCase().includes('meta') ? 'meta' : 'google_ads'
)
const name = ref('Persona campaign audience')
const busy = ref(false)
const actionError = ref('')
const data = ref<{
  items: ActivationItem[]
  providerDispatchEnabled: boolean
  providerState?: {
    exports: Array<{
      requestId: string
      status: string
      attemptedAdditions: number
      attemptedRemovals: number
      successfulAdditions: number
      successfulRemovals: number
      errorMessage: string | null
    }>
  }
  providerReadiness: ProviderReadiness[]
} | null>(null)
const status = ref<'pending' | 'success' | 'error'>('pending')
const selectedReadiness = computed(() =>
  data.value?.providerReadiness.find(item => item.provider === provider.value)
)
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: {
    method?: 'GET' | 'POST' | 'PATCH'
    query?: Record<string, unknown>
    body?: Record<string, unknown>
  }
) => Promise<T>

async function refresh() {
  status.value = 'pending'
  try {
    data.value = await apiFetch('/api/agency/analytics/personas/activations', {
      query: { clientId: props.clientId }
    })
    status.value = 'success'
  } catch (error) {
    status.value = 'error'
    actionError.value = error instanceof Error ? error.message : 'Activation requests are unavailable'
  }
}

onMounted(() => {
  void refresh()
})

function filters() {
  return {
    startDate: props.startDate,
    endDate: props.endDate,
    ...(props.platform ? { platform: props.platform } : {}),
    ...(props.campaignId ? { campaignId: props.campaignId } : {})
  }
}

async function createRequest() {
  busy.value = true
  actionError.value = ''
  try {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)
    await apiFetch('/api/agency/analytics/personas/activations', {
      method: 'POST',
      body: {
        clientId: props.clientId,
        provider: provider.value,
        name: name.value,
        filters: filters(),
        expiresAt: expiresAt.toISOString()
      }
    })
    await refresh()
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Activation request failed'
  } finally {
    busy.value = false
  }
}

async function transition(
  item: ActivationItem,
  action: 'approve_privacy' | 'approve_live' | 'cancel' | 'retry' | 'deactivate'
) {
  busy.value = true
  actionError.value = ''
  try {
    await apiFetch(`/api/agency/analytics/personas/activations/${item.id}`, {
      method: 'PATCH',
      body: {
        clientId: props.clientId,
        action,
        acceptProviderTerms: action === 'approve_live' ? true : undefined,
        reason: action === 'approve_privacy'
          ? 'Privacy and consent controls reviewed'
          : action === 'approve_live'
            ? 'Live provider export approved'
            : action === 'retry'
              ? 'Provider audience reconciliation requested'
              : action === 'deactivate'
                ? 'Provider audience removal requested'
                : 'Activation request cancelled'
      }
    })
    await refresh()
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Activation update failed'
  } finally {
    busy.value = false
  }
}

function statusColor(statusValue: string) {
  if (statusValue === 'approved') return 'success'
  if (statusValue === 'blocked' || statusValue === 'rejected') return 'error'
  if (statusValue === 'privacy_approved') return 'warning'
  return 'neutral'
}

function latestExport(requestId: string) {
  return data.value?.providerState?.exports.find(item => item.requestId === requestId)
}

function readinessColor(ready: boolean) {
  return ready ? 'success' : 'neutral'
}
</script>

<template>
  <UCard>
    <template #header>
      <div>
        <h2 class="font-semibold">Audience activation controls</h2>
        <p class="mt-1 text-xs text-muted">
          Create a consented cohort, complete two-person approval, then sync it to the mapped provider account.
        </p>
      </div>
    </template>

    <div v-if="data?.providerReadiness.length" class="mb-4 grid gap-3 lg:grid-cols-2">
      <div
        v-for="item in data.providerReadiness"
        :key="item.provider"
        class="rounded-lg border border-default bg-elevated/30 p-3"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-medium">
              {{ item.provider === 'google_ads' ? 'Google Ads readiness' : 'Meta readiness' }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ item.dispatchReady ? 'Ready for governed provider dispatch.' : 'Activation prerequisites remain.' }}
            </p>
          </div>
          <UBadge :color="item.dispatchReady ? 'success' : 'warning'" variant="subtle">
            {{ item.dispatchReady ? 'Dispatch ready' : 'Not ready' }}
          </UBadge>
        </div>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <UBadge :color="readinessColor(item.identityEntitlement === 'active' || item.identityEntitlement === 'trial' || item.identityEntitlement === 'grace')" variant="subtle" size="xs">
            Identity {{ item.identityEntitlement }}
          </UBadge>
          <UBadge :color="readinessColor(item.audienceEntitlement === 'active' || item.audienceEntitlement === 'trial' || item.audienceEntitlement === 'grace')" variant="subtle" size="xs">
            Audience {{ item.audienceEntitlement }}
          </UBadge>
          <UBadge :color="readinessColor(item.clientAuthorization === 'accepted')" variant="subtle" size="xs">
            Client {{ item.clientAuthorization }}
          </UBadge>
          <UBadge :color="readinessColor(item.connectionReady)" variant="subtle" size="xs">
            Connection {{ item.connectionReady ? 'ready' : 'required' }}
          </UBadge>
          <UBadge :color="readinessColor(item.providerConfigured && item.termsAccepted)" variant="subtle" size="xs">
            Provider {{ item.providerConfigured && item.termsAccepted ? 'configured' : 'setup required' }}
          </UBadge>
          <UBadge :color="readinessColor(item.globalWritesEnabled && !item.emergencyStopped)" variant="subtle" size="xs">
            Safety {{ item.emergencyStopped ? 'stopped' : item.globalWritesEnabled ? 'enabled' : 'globally paused' }}
          </UBadge>
        </div>
        <p v-if="item.lastError" class="mt-2 text-xs text-error">
          {{ item.lastError }}
        </p>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-[160px_minmax(220px,1fr)_auto]">
      <USelect
        v-model="provider"
        :items="[
          { label: 'Google Ads', value: 'google_ads' },
          { label: 'Meta', value: 'meta' }
        ]"
        value-key="value"
        aria-label="Audience provider"
      />
      <UInput v-model="name" maxlength="120" aria-label="Audience request name" />
      <UButton
        icon="i-lucide-shield-check"
        :loading="busy"
        :disabled="name.trim().length < 3 || !selectedReadiness?.requestReady"
        @click="createRequest"
      >
        Request review
      </UButton>
    </div>
    <p v-if="selectedReadiness && !selectedReadiness.requestReady" class="mt-2 text-xs text-warning">
      Persona Identity and the selected provider audience entitlement must be active before review can begin.
    </p>

    <UAlert
      v-if="actionError"
      class="mt-3"
      color="error"
      icon="i-lucide-circle-alert"
      title="Audience request was not updated"
      :description="actionError"
    />

    <div v-if="status === 'pending' && !data" class="mt-4 space-y-2">
      <USkeleton v-for="index in 2" :key="index" class="h-16 rounded-lg" />
    </div>
    <div v-else-if="data?.items.length" class="mt-4 space-y-2">
      <div
        v-for="item in data.items"
        :key="item.id"
        class="flex flex-wrap items-center gap-3 rounded-lg border border-default p-3"
      >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="truncate text-sm font-medium">{{ item.name }}</p>
            <UBadge :color="statusColor(item.status)" variant="subtle">
              {{ item.status.replaceAll('_', ' ') }}
            </UBadge>
            <UBadge color="neutral" variant="subtle">
              {{ item.provider === 'google_ads' ? 'Google Ads' : 'Meta' }}
            </UBadge>
          </div>
          <p class="mt-1 text-xs text-muted">
            {{ item.estimatedSize }} estimated personas · minimum {{ item.minimumSize }}
            <span v-if="item.blockedReason">· {{ item.blockedReason }}</span>
          </p>
          <p v-if="latestExport(item.id)" class="mt-1 text-xs text-muted">
            Provider {{ latestExport(item.id)?.status }}
            · {{ latestExport(item.id)?.successfulAdditions || 0 }} added
            · {{ latestExport(item.id)?.successfulRemovals || 0 }} removed
            <span v-if="latestExport(item.id)?.errorMessage">
              · {{ latestExport(item.id)?.errorMessage }}
            </span>
          </p>
        </div>
        <UButton
          v-if="item.status === 'pending_privacy'"
          size="xs"
          color="neutral"
          variant="outline"
          :loading="busy"
          @click="transition(item, 'approve_privacy')"
        >
          Privacy approve
        </UButton>
        <UButton
          v-if="item.status === 'privacy_approved'"
          size="xs"
          color="warning"
          variant="outline"
          :loading="busy"
          @click="transition(item, 'approve_live')"
        >
          Live approve
        </UButton>
        <UButton
          v-if="item.status === 'approved'"
          size="xs"
          color="neutral"
          variant="outline"
          :loading="busy"
          @click="transition(item, 'retry')"
        >
          Sync now
        </UButton>
        <UButton
          v-if="item.status === 'approved'"
          size="xs"
          color="error"
          variant="soft"
          :loading="busy"
          @click="transition(item, 'deactivate')"
        >
          Remove from provider
        </UButton>
        <UButton
          v-if="['pending_privacy', 'privacy_approved'].includes(item.status)"
          size="xs"
          color="neutral"
          variant="ghost"
          :loading="busy"
          @click="transition(item, 'cancel')"
        >
          Cancel
        </UButton>
      </div>
    </div>
    <p v-else class="mt-4 text-sm text-muted">
      No audience activation requests for this client.
    </p>

    <p class="mt-4 border-t border-default pt-3 text-xs text-muted">
      Provider dispatch is <strong>{{ data?.providerDispatchEnabled ? 'enabled' : 'paused' }}</strong>.
      Only people with current marketing consent and a matchable email or phone are uploaded. Consent withdrawals,
      CRM do-not-contact settings and manual deactivation are propagated as provider removals.
    </p>
  </UCard>
  <PersonaProviderConfiguration />
</template>
