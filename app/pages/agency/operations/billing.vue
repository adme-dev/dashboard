<script setup lang="ts">
definePageMeta({ layout: 'agency' })

interface Client {
  id: string
  name: string
}

interface BillingOverview {
  client: Client
  subscription: null | {
    status: string
    currentPeriodStartsAt: string | null
    currentPeriodEndsAt: string | null
    plan: { code: string, name: string }
  }
  availablePlans: Array<{
    code: string
    name: string
    status: string
    billingPeriod: string
    basePriceMinor: number
    currency: string
    entitlements: Array<{ featureKey: string, metered: boolean }>
  }>
  entitlements: Record<string, {
    featureKey: string
    enabled: boolean
    status: string
    source: string
  }>
  usage: Array<{
    featureKey: string
    meterKey: string
    unit: string
    quantity: number
  }>
}

const { apiFetch } = useApi()
const toast = useToast()
const clients = ref<Client[]>([])
const clientId = ref('')
const overview = ref<BillingOverview | null>(null)
const loading = ref(true)
const saving = ref(false)
const planCode = ref('')
const status = ref('active')
const statuses = ['trial', 'active', 'grace', 'overdue', 'suspended', 'cancelled']

const clientOptions = computed(() => clients.value.map(client => ({
  label: client.name,
  value: client.id
})))
const planOptions = computed(() => (overview.value?.availablePlans || [])
  .filter(plan => plan.status === 'active')
  .map(plan => ({
    label: `${plan.name} (${plan.billingPeriod})`,
    value: plan.code
  })))

function title(value: string) {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
}

async function loadOverview() {
  if (!clientId.value) {
    overview.value = null
    return
  }
  loading.value = true
  try {
    overview.value = await apiFetch<BillingOverview>(
      `/api/agency/billing/clients/${clientId.value}`
    )
    planCode.value = overview.value.subscription?.plan.code
      || overview.value.availablePlans.find(plan => plan.status === 'active')?.code
      || ''
    status.value = overview.value.subscription?.status || 'active'
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!clientId.value || !planCode.value) return
  saving.value = true
  try {
    overview.value = await apiFetch<BillingOverview>(
      `/api/agency/billing/clients/${clientId.value}`,
      {
        method: 'PUT',
        body: {
          planCode: planCode.value,
          status: status.value,
          overrides: [],
          removeOverrideKeys: []
        }
      }
    )
    toast.add({
      title: 'Billing updated',
      description: `${overview.value.client.name} now uses the ${overview.value.subscription?.plan.name || planCode.value} plan.`,
      color: 'success'
    })
  } catch (cause: any) {
    toast.add({
      title: 'Billing update failed',
      description: cause?.data?.statusMessage || cause?.message || 'Please try again.',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    clients.value = await apiFetch<Client[]>('/api/agency/clients?active=true')
    clientId.value = clients.value[0]?.id || ''
    await loadOverview()
  } finally {
    loading.value = false
  }
})

watch(clientId, loadOverview)
</script>

<template>
  <div class="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Operations
        </p>
        <h1 class="mt-2 text-2xl font-semibold">
          Client billing and entitlements
        </h1>
        <p class="mt-2 max-w-3xl text-sm text-muted">
          Assign plans, control subscription state, and review tenant-scoped usage without changing existing feature overrides.
        </p>
      </div>
      <div class="w-full sm:w-80">
        <label class="mb-2 block text-xs font-medium text-muted">Client</label>
        <USelect
          v-model="clientId"
          :items="clientOptions"
          value-key="value"
          class="w-full"
        />
      </div>
    </div>

    <USkeleton v-if="loading && !overview" class="h-72 w-full" />

    <template v-else-if="overview">
      <UCard>
        <template #header>
          <div>
            <p class="font-medium">
              Subscription
            </p>
            <p class="mt-1 text-sm text-muted">
              Changes are written to the append-only billing audit ledger.
            </p>
          </div>
        </template>
        <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <div>
            <label class="mb-2 block text-xs font-medium text-muted">Plan</label>
            <USelect
              v-model="planCode"
              :items="planOptions"
              value-key="value"
              class="w-full"
            />
          </div>
          <div>
            <label class="mb-2 block text-xs font-medium text-muted">Status</label>
            <USelect
              v-model="status"
              :items="statuses.map(item => ({ label: title(item), value: item }))"
              value-key="value"
              class="w-full"
            />
          </div>
          <UButton
            icon="i-lucide-save"
            :loading="saving"
            :disabled="!planCode"
            @click="save"
          >
            Save subscription
          </UButton>
        </div>
      </UCard>

      <div class="grid gap-6 xl:grid-cols-2">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <p class="font-medium">
                Effective entitlements
              </p>
              <UBadge color="neutral" variant="subtle">
                {{ Object.values(overview.entitlements).filter(item => item.enabled).length }} enabled
              </UBadge>
            </div>
          </template>
          <div class="divide-y divide-default">
            <div
              v-for="item in Object.values(overview.entitlements)"
              :key="item.featureKey"
              class="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <p class="text-sm font-medium">
                  {{ title(item.featureKey) }}
                </p>
                <p class="text-xs text-muted">
                  Source: {{ item.source }}
                </p>
              </div>
              <UBadge
                :color="item.enabled ? 'success' : 'neutral'"
                variant="subtle"
              >
                {{ title(item.status) }}
              </UBadge>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <p class="font-medium">
                Current-period usage
              </p>
              <UBadge color="neutral" variant="subtle">
                {{ overview.usage.length }} meters
              </UBadge>
            </div>
          </template>
          <div v-if="overview.usage.length" class="divide-y divide-default">
            <div
              v-for="meter in overview.usage"
              :key="`${meter.featureKey}:${meter.meterKey}`"
              class="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <p class="text-sm font-medium">
                  {{ title(meter.featureKey) }}
                </p>
                <p class="text-xs text-muted">
                  {{ title(meter.meterKey) }}
                </p>
              </div>
              <p class="text-sm font-semibold">
                {{ meter.quantity.toLocaleString() }}
                <span class="font-normal text-muted">{{ meter.unit }}</span>
              </p>
            </div>
          </div>
          <p v-else class="text-sm text-muted">
            No metered activity has been recorded for this period.
          </p>
        </UCard>
      </div>
    </template>
  </div>
</template>
