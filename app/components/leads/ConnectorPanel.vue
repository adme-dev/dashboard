<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  clientItems: Array<{ label: string, value: string }>
}>()

interface Connector {
  id: string
  clientId: string
  siteId: string | null
  provider: string
  type: string
  status: string
  path: string | null
  lastReceiptAt: string | null
  lastErrorClass: string | null
  duplicateReceipts: number
  replayRejections: number
}

interface TrackingSite {
  id: string
  name: string
  allowed_origins?: string[]
}

interface CaptureTestRun {
  id: string
  status: 'created' | 'running' | 'passed' | 'failed' | 'timed_out' | 'cancelled'
  expiresAt: string
  events: Array<{
    id: string
    stage: string
    outcome: 'passed' | 'failed' | 'skipped'
    diagnostic: string | null
  }>
}

const toast = useToast()
const apiFetch = $fetch as any
const clientId = ref<string | null>(null)
const siteId = ref<string | null>(null)
const provider = ref('first_party')
const origin = ref('')
const reason = ref('Provision approved universal lead gateway')
const connectors = ref<Connector[]>([])
const sites = ref<TrackingSite[]>([])
const selectedConnectorId = ref<string | null>(null)
const loading = ref(false)
const creating = ref(false)
const startingTest = ref(false)
const refreshingTest = ref(false)
const copyOnceSecret = ref<string | null>(null)
const testUrl = ref<string | null>(null)
const currentRun = ref<CaptureTestRun | null>(null)

const siteItems = computed(() => sites.value.map(site => ({ label: site.name, value: site.id })))
const connectorItems = computed(() => connectors.value.map(connector => ({
  label: `${connector.provider} · ${connector.status}`,
  value: connector.id
})))
const baseUrl = computed(() => import.meta.client ? window.location.origin : 'https://app.xeroflow.io')
const selectedConnector = computed(() => connectors.value.find(item => item.id === selectedConnectorId.value) ?? null)
const webhookUrl = computed(() => selectedConnector.value?.path
  ? `${baseUrl.value}${selectedConnector.value.path}`
  : '')

function message(error: unknown, fallback: string) {
  return (error as any)?.data?.statusMessage || (error as any)?.statusMessage || fallback
}

async function copy(value: string, title: string) {
  if (!value || !import.meta.client) return
  await navigator.clipboard.writeText(value)
  toast.add({ title, color: 'success' })
}

async function loadClient() {
  if (!clientId.value) return
  loading.value = true
  copyOnceSecret.value = null
  testUrl.value = null
  currentRun.value = null
  try {
    const [connectorResult, siteResult] = await Promise.all([
      apiFetch('/api/leads/connectors', { query: { clientId: clientId.value } }) as Promise<{ items: Connector[] }>,
      apiFetch('/api/agency/tracking', { query: { clientId: clientId.value } }) as Promise<{ sites: TrackingSite[] }>
    ])
    connectors.value = connectorResult.items
    sites.value = siteResult.sites
    selectedConnectorId.value = connectors.value[0]?.id ?? null
    siteId.value = sites.value[0]?.id ?? null
    if (!origin.value) origin.value = sites.value[0]?.allowed_origins?.[0] ?? ''
  } catch (error) {
    toast.add({ title: 'Gateway details unavailable', description: message(error, 'Try again.'), color: 'error' })
  } finally {
    loading.value = false
  }
}

async function createConnector() {
  if (!clientId.value || !origin.value.trim() || !reason.value.trim()) return
  creating.value = true
  try {
    const result = await apiFetch('/api/leads/connectors', {
      method: 'POST',
      body: {
        clientId: clientId.value,
        siteId: siteId.value,
        type: 'first_party_gateway',
        provider: provider.value.trim(),
        authority: 'canonical',
        capabilities: ['push', 'browser_correlation'],
        approvedOrigins: [origin.value.trim()],
        formReferences: [],
        reason: reason.value.trim()
      }
    }) as { connector: Connector, secret: string | null }
    connectors.value = [...connectors.value, result.connector]
    selectedConnectorId.value = result.connector.id
    copyOnceSecret.value = result.secret
    toast.add({ title: 'Signed gateway created', description: 'Copy the signing secret now; it will not be shown again.', color: 'success' })
  } catch (error) {
    toast.add({ title: 'Gateway could not be created', description: message(error, 'Check the origin and configuration.'), color: 'error' })
  } finally {
    creating.value = false
  }
}

async function startTest() {
  if (!clientId.value || !selectedConnectorId.value || !origin.value.trim()) return
  startingTest.value = true
  try {
    const result = await apiFetch('/api/leads/capture-tests', {
      method: 'POST',
      body: {
        clientId: clientId.value,
        siteId: siteId.value,
        connectorId: selectedConnectorId.value,
        expectedOrigin: origin.value.trim(),
        reason: reason.value.trim(),
        expectedStages: [
          'tracker_loaded', 'candidate_created', 'provider_success_observed',
          'trusted_receipt_accepted', 'candidate_reconciled',
          'canonical_test_lead_stored', 'destinations_validated'
        ]
      }
    }) as { run: CaptureTestRun, bootstrapToken: string }
    const target = new URL(origin.value.trim())
    target.searchParams.set('xf_test_token', result.bootstrapToken)
    testUrl.value = target.toString()
    currentRun.value = result.run
    toast.add({ title: '15-minute test started', description: 'Open the test URL and submit one enquiry.', color: 'success' })
  } catch (error) {
    toast.add({ title: 'Test could not start', description: message(error, 'Check the connector origin.'), color: 'error' })
  } finally {
    startingTest.value = false
  }
}

async function refreshTest() {
  if (!clientId.value || !currentRun.value) return
  refreshingTest.value = true
  try {
    const result = await apiFetch(`/api/leads/capture-tests/${currentRun.value.id}`, {
      query: { clientId: clientId.value }
    }) as { run: CaptureTestRun }
    currentRun.value = result.run
  } catch (error) {
    toast.add({ title: 'Test evidence unavailable', description: message(error, 'Try again.'), color: 'error' })
  } finally {
    refreshingTest.value = false
  }
}

watch(clientId, () => {
  origin.value = ''
  void loadClient()
})
watch(() => props.clientItems, (items) => {
  if (!clientId.value && items.length) clientId.value = items[0].value
}, { immediate: true })
</script>

<template>
  <UCard class="mb-5" variant="subtle">
    <template #header>
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-route" class="mt-0.5 size-5 text-primary" />
        <div>
          <h3 class="text-sm font-semibold">Universal lead gateway</h3>
          <p class="mt-1 text-xs text-muted">Signed canonical receipts, browser correlation, and contained end-to-end tests.</p>
        </div>
      </div>
    </template>

    <div class="@container space-y-4">
      <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <UFormField label="Client">
          <USelectMenu v-model="clientId" :items="clientItems" value-key="value" placeholder="Select a client" class="w-full" />
        </UFormField>
        <UFormField label="Tracking site">
          <USelectMenu v-model="siteId" :items="siteItems" value-key="value" placeholder="Select a site" class="w-full" :loading="loading" />
        </UFormField>
        <UFormField label="Approved origin or test page URL" help="A full form page URL is preserved for the test; connector approval is restricted to its origin.">
          <UInput v-model="origin" placeholder="https://www.example.com.au/vehicles/example" class="w-full" />
        </UFormField>
        <UFormField label="Provider key" help="Lowercase identifier, for example dealer_studio or first_party.">
          <UInput v-model="provider" class="w-full" />
        </UFormField>
        <UFormField label="Change reason" class="@lg:col-span-2">
          <UTextarea v-model="reason" :rows="2" class="w-full" />
        </UFormField>
      </div>

      <div class="flex flex-wrap gap-2">
        <UButton label="Create signed gateway" icon="i-lucide-plus" :loading="creating" :disabled="!clientId || !origin || !reason" @click="createConnector" />
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="loading" @click="loadClient" />
      </div>

      <UAlert v-if="copyOnceSecret" color="warning" variant="subtle" icon="i-lucide-key-round" title="Copy this signing secret now" description="For security it will not be returned again.">
        <template #actions>
          <UButton label="Copy secret" size="xs" color="warning" variant="soft" @click="copy(copyOnceSecret, 'Signing secret copied')" />
        </template>
      </UAlert>

      <div v-if="connectors.length" class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <UFormField label="Connector">
          <USelectMenu v-model="selectedConnectorId" :items="connectorItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="Signed webhook URL">
          <div class="flex gap-2">
            <UInput :model-value="webhookUrl" readonly class="w-full font-mono" />
            <UButton icon="i-lucide-copy" color="neutral" variant="ghost" aria-label="Copy signed webhook URL" @click="copy(webhookUrl, 'Webhook URL copied')" />
          </div>
        </UFormField>
      </div>

      <div v-if="selectedConnector" class="flex items-center justify-between gap-3 rounded-md border border-default bg-elevated/40 p-3">
        <div class="min-w-0 text-sm">
          <p class="font-medium">{{ selectedConnector.status }} · {{ selectedConnector.provider }}</p>
          <p class="truncate text-xs text-muted">Last receipt: {{ selectedConnector.lastReceiptAt || 'none yet' }}<span v-if="selectedConnector.lastErrorClass"> · {{ selectedConnector.lastErrorClass }}</span></p>
          <p class="mt-0.5 text-xs text-muted">Duplicates: {{ selectedConnector.duplicateReceipts }} · replay rejections: {{ selectedConnector.replayRejections }}</p>
        </div>
        <UButton label="Start contained test" icon="i-lucide-flask-conical" color="neutral" variant="outline" :loading="startingTest" @click="startTest" />
      </div>

      <UAlert v-if="testUrl" color="info" variant="subtle" icon="i-lucide-external-link" title="Test URL ready" description="Open this URL, complete one real form flow, then return to inspect the append-only stage evidence.">
        <template #actions>
          <UButton label="Open test" size="xs" color="info" variant="soft" :to="testUrl" target="_blank" />
          <UButton label="Copy test URL" size="xs" color="info" variant="soft" @click="copy(testUrl, 'Test URL copied')" />
          <UButton label="Refresh evidence" size="xs" color="neutral" variant="soft" :loading="refreshingTest" @click="refreshTest" />
        </template>
      </UAlert>

      <UCard v-if="currentRun" variant="subtle">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-sm font-medium">Capture test · {{ currentRun.status }}</p>
            <p class="text-xs text-muted">Expires {{ new Date(currentRun.expiresAt).toLocaleString() }}</p>
          </div>
          <UBadge :color="currentRun.status === 'passed' ? 'success' : currentRun.status === 'failed' ? 'error' : 'neutral'" variant="subtle">
            {{ currentRun.events.length }} evidence stages
          </UBadge>
        </div>
        <div v-if="currentRun.events.length" class="mt-3 space-y-2">
          <div v-for="event in currentRun.events" :key="event.id" class="rounded-md border border-default px-3 py-2 text-xs">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-highlighted">{{ event.stage.replace(/_/g, ' ') }}</span>
              <UBadge :color="event.outcome === 'failed' ? 'error' : event.outcome === 'passed' ? 'success' : 'neutral'" size="xs" variant="subtle">{{ event.outcome }}</UBadge>
            </div>
            <p v-if="event.diagnostic" class="mt-1 text-muted">{{ event.diagnostic }}</p>
          </div>
        </div>
        <p v-else class="mt-3 text-xs text-muted">No stage evidence yet. Open the test URL, complete one form, then refresh.</p>
      </UCard>
    </div>
  </UCard>
</template>
