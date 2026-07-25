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
} | null>(null)
const status = ref<'pending' | 'success' | 'error'>('pending')
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

async function transition(item: ActivationItem, action: 'approve_privacy' | 'approve_live' | 'cancel') {
  busy.value = true
  actionError.value = ''
  try {
    await apiFetch(`/api/agency/analytics/personas/activations/${item.id}`, {
      method: 'PATCH',
      body: {
        clientId: props.clientId,
        action,
        reason: action === 'approve_privacy'
          ? 'Privacy and consent controls reviewed'
          : action === 'approve_live'
            ? 'Live provider export approved'
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
</script>

<template>
  <UCard>
    <template #header>
      <div>
        <h2 class="font-semibold">Audience activation controls</h2>
        <p class="mt-1 text-xs text-muted">
          Create an aggregate cohort request. Provider export requires two-person approval and remains disabled by default.
        </p>
      </div>
    </template>

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
        :disabled="name.trim().length < 3"
        @click="createRequest"
      >
        Request review
      </UButton>
    </div>

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
          v-if="['pending_privacy', 'privacy_approved', 'approved'].includes(item.status)"
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
      Approved requests are export-ready records only. Google Customer Match and Meta Custom Audience dispatch remain off until destination credentials, individual consent eligibility, suppression, and provider reconciliation are configured.
    </p>
  </UCard>
</template>
