<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  MeasurementCapabilityStatus,
  PortalMeasurementHealth,
  PortalMeasurementSignalSummary
} from '~/types/measurement'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const apiFetch = useRequestFetch() as <T>(request: string) => Promise<T>
const health = ref<PortalMeasurementHealth | null>(null)
const pending = ref(true)
const loadError = ref<string | null>(null)

const statusPresentation = computed(() => {
  if (health.value?.status === 'healthy') return { label: 'Healthy', color: 'success' as const, icon: 'i-lucide-circle-check' }
  if (health.value?.status === 'degraded') return { label: 'Needs attention', color: 'error' as const, icon: 'i-lucide-circle-alert' }
  if (health.value?.status === 'paused') return { label: 'Paused', color: 'warning' as const, icon: 'i-lucide-pause-circle' }
  return { label: 'Onboarding', color: 'info' as const, icon: 'i-lucide-loader-circle' }
})

const ownerLabels: Record<PortalMeasurementSignalSummary['owners'][number], string> = {
  zero: 'Managed by Zero',
  gtm: 'Google Tag Manager',
  partner: 'Partner managed',
  external: 'Externally managed'
}

const capabilityStatusLabels: Record<MeasurementCapabilityStatus, string> = {
  not_configured: 'Not set up',
  detected: 'Found',
  configured: 'Set up',
  validating: 'Checking',
  ready: 'Healthy',
  degraded: 'Needs attention',
  blocked: 'Blocked'
}

const signalCards = computed(() => health.value
  ? [
      {
        key: 'browser',
        title: 'Browser tracking',
        description: 'Website and tag-based conversion signals.',
        icon: 'i-lucide-panel-top',
        signal: health.value.signals.browser
      },
      {
        key: 'server',
        title: 'Server-side tracking',
        description: 'Server events and provider-side data delivery.',
        icon: 'i-lucide-server-cog',
        signal: health.value.signals.server
      },
      {
        key: 'crm',
        title: 'CRM outcomes',
        description: 'Lead qualification and downstream lifecycle outcomes.',
        icon: 'i-lucide-contact-round',
        signal: health.value.signals.crm
      }
    ]
  : [])

function statusColor(status: MeasurementCapabilityStatus) {
  if (status === 'ready') return 'success' as const
  if (status === 'blocked') return 'error' as const
  if (status === 'degraded' || status === 'validating') return 'warning' as const
  if (status === 'configured' || status === 'detected') return 'info' as const
  return 'neutral' as const
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function canonicalEventLabel(value: string) {
  const labels: Record<string, string> = {
    lead_created: 'Lead Created',
    lead_contacted: 'Lead Contacted',
    lead_qualified: 'Qualified Lead',
    lead_won: 'Won Lead',
    lead_lost: 'Lost Lead',
    web_conversion: 'Web Conversion',
    purchase: 'Purchase'
  }
  return labels[value] || titleCase(value)
}

function formatDateTime(value: string | null) {
  if (!value) return 'No evidence yet'
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function errorMessage(error: unknown) {
  const candidate = error as { data?: { statusMessage?: string }, message?: string } | null
  return candidate?.data?.statusMessage || candidate?.message || 'Measurement health could not be loaded'
}

async function refreshHealth() {
  pending.value = true
  loadError.value = null
  try {
    health.value = await apiFetch<PortalMeasurementHealth>('/api/portal/measurement')
  } catch (error: unknown) {
    health.value = null
    loadError.value = errorMessage(error)
  } finally {
    pending.value = false
  }
}

void refreshHealth()
</script>

<template>
  <UDashboardPanel id="portal-measurement">
    <template #header>
      <UDashboardNavbar title="Measurement health">
        <template #right>
          <UButton
            label="Refresh"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="pending"
            @click="refreshHealth"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div v-if="pending" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          <div v-for="index in 6" :key="index" class="h-36 animate-pulse rounded-xl bg-elevated" />
        </div>

        <div v-else-if="loadError" class="rounded-xl border border-error/30 bg-error/5 p-6">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="font-semibold text-error">
                Measurement health unavailable
              </h2>
              <p class="mt-1 text-sm text-muted">
                {{ loadError }}
              </p>
            </div>
            <UButton
              label="Try again"
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="outline"
              @click="refreshHealth"
            />
          </div>
        </div>

        <template v-else-if="health">
          <section class="overflow-hidden rounded-xl border border-default bg-default shadow-xs">
            <div class="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 sm:p-8">
              <div class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div class="max-w-3xl">
                  <p class="text-sm font-medium text-primary">
                    Conversion measurement
                  </p>
                  <h2 class="mt-1 text-2xl font-semibold text-highlighted">
                    {{ statusPresentation.label }}
                  </h2>
                  <p class="mt-2 text-sm leading-6 text-muted">
                    {{ health.statusMessage }}
                  </p>
                </div>
                <UBadge :color="statusPresentation.color" variant="subtle">
                  <UIcon :name="statusPresentation.icon" class="mr-1 size-4" />
                  {{ statusPresentation.label }}
                </UBadge>
              </div>

              <dl class="mt-6 grid gap-4 border-t border-default/70 pt-5 sm:grid-cols-3">
                <div>
                  <dt class="text-xs uppercase tracking-wide text-dimmed">
                    Delivery state
                  </dt>
                  <dd class="mt-1 text-sm font-medium text-highlighted">
                    {{ titleCase(health.deliveryState) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-dimmed">
                    Outcome source
                  </dt>
                  <dd class="mt-1 text-sm font-medium text-highlighted">
                    {{ health.authority.source }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-dimmed">
                    Last validated
                  </dt>
                  <dd class="mt-1 text-sm font-medium text-highlighted">
                    {{ formatDateTime(health.lastValidatedAt) }}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <section class="rounded-xl border border-default bg-default p-5 shadow-xs sm:p-6">
            <div>
              <h2 class="font-semibold text-highlighted">
                Measurement funnel
              </h2>
              <p class="mt-1 text-sm text-muted">
                Aggregate website collection and confirmed lead evidence. Visitor identifiers stay private.
              </p>
            </div>
            <dl class="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-default bg-default sm:grid-cols-2 lg:grid-cols-4">
              <div class="bg-elevated/40 p-4">
                <dt class="text-xs font-medium uppercase tracking-wide text-dimmed">Website visits</dt>
                <dd class="mt-2 text-2xl font-semibold tabular-nums text-highlighted">{{ health.funnel.visits }}</dd>
              </div>
              <div class="bg-elevated/40 p-4">
                <dt class="text-xs font-medium uppercase tracking-wide text-dimmed">Confirmed leads</dt>
                <dd class="mt-2 text-2xl font-semibold tabular-nums text-highlighted">{{ health.funnel.confirmedLeads }}</dd>
              </div>
              <div class="bg-elevated/40 p-4">
                <dt class="text-xs font-medium uppercase tracking-wide text-dimmed">Last signal collected</dt>
                <dd class="mt-2 text-sm font-medium text-highlighted">{{ formatDateTime(health.freshness.lastCollectionAt) }}</dd>
              </div>
              <div class="bg-elevated/40 p-4">
                <dt class="text-xs font-medium uppercase tracking-wide text-dimmed">Last provider delivery</dt>
                <dd class="mt-2 text-sm font-medium text-highlighted">{{ formatDateTime(health.freshness.lastDeliveryAt) }}</dd>
              </div>
            </dl>
          </section>

          <section>
            <div>
              <h2 class="font-semibold text-highlighted">
                Signal coverage
              </h2>
              <p class="mt-1 text-sm text-muted">
                Ownership is shown separately so browser, server, and CRM signals are not mistaken for one another.
              </p>
            </div>
            <div class="mt-4 grid gap-4 lg:grid-cols-3">
              <article v-for="card in signalCards" :key="card.key" class="rounded-xl border border-default bg-default p-5 shadow-xs">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex gap-3">
                    <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <UIcon :name="card.icon" class="size-5" />
                    </div>
                    <div>
                      <h3 class="font-medium text-highlighted">
                        {{ card.title }}
                      </h3>
                      <p class="mt-1 text-xs leading-5 text-muted">
                        {{ card.description }}
                      </p>
                    </div>
                  </div>
                  <UBadge :color="statusColor(card.signal.status)" variant="subtle">
                    {{ capabilityStatusLabels[card.signal.status] }}
                  </UBadge>
                </div>
                <div class="mt-4 flex flex-wrap gap-2">
                  <span v-for="owner in card.signal.owners" :key="owner" class="rounded-md bg-elevated px-2.5 py-1 text-xs text-muted">
                    {{ ownerLabels[owner] }}
                  </span>
                  <span v-if="!card.signal.owners.length" class="text-xs text-muted">Ownership not configured</span>
                </div>
                <p class="mt-3 text-xs text-dimmed">
                  Evidence: {{ formatDateTime(card.signal.lastEvidenceAt) }}
                </p>
              </article>
            </div>
          </section>

          <section v-if="health.eventIdentity.length" class="rounded-xl border border-default bg-default p-5 shadow-xs sm:p-6">
            <h2 class="font-semibold text-highlighted">
              Event delivery identity
            </h2>
            <p class="mt-1 text-sm text-muted">
              Shows which outcomes use a shared website event ID and which originate only from lead or CRM lifecycle changes.
            </p>
            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <article v-for="identity in health.eventIdentity" :key="`${identity.canonicalEventName}:${identity.mode}`" class="rounded-lg border border-default bg-elevated/40 p-4">
                <p class="text-sm font-medium text-highlighted">
                  {{ canonicalEventLabel(identity.canonicalEventName) }}
                </p>
                <p class="mt-1 text-xs text-muted">
                  {{ identity.label }}
                </p>
              </article>
            </div>
          </section>

          <div class="grid gap-6 lg:grid-cols-2">
            <section class="rounded-xl border border-default bg-default p-5 shadow-xs sm:p-6">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h2 class="font-semibold text-highlighted">
                    Outcome sync
                  </h2>
                  <p class="mt-1 text-sm text-muted">
                    Lifecycle statuses accepted from {{ health.authority.source }}.
                  </p>
                </div>
                <UIcon name="i-lucide-refresh-cw" class="size-5 text-primary" />
              </div>
              <div class="mt-5 grid grid-cols-2 gap-3">
                <div class="rounded-lg bg-elevated p-4">
                  <p class="text-2xl font-semibold text-highlighted">
                    {{ health.authority.acceptedOutcomeCount }}
                  </p>
                  <p class="mt-1 text-sm text-muted">
                    {{ health.authority.acceptedOutcomeCount }} accepted
                  </p>
                </div>
                <div class="rounded-lg bg-elevated p-4">
                  <p class="text-2xl font-semibold text-highlighted">
                    {{ health.authority.rejectedOutcomeCount }}
                  </p>
                  <p class="mt-1 text-sm text-muted">
                    {{ health.authority.rejectedOutcomeCount }} rejected
                  </p>
                </div>
              </div>
              <p class="mt-4 text-xs text-muted">
                Last sync: {{ formatDateTime(health.authority.lastSyncAt) }}
              </p>
            </section>

            <section class="rounded-xl border border-default bg-default p-5 shadow-xs sm:p-6">
              <div>
                <h2 class="font-semibold text-highlighted">
                  Provider delivery
                </h2>
                <p class="mt-1 text-sm text-muted">
                  Safe provider outcome totals; technical diagnostics stay with your agency.
                </p>
              </div>
              <dl class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="rounded-lg bg-elevated p-3">
                  <dt class="text-xs text-muted">
                    Accepted
                  </dt><dd class="mt-1 font-semibold text-highlighted">
                    {{ health.delivery.acceptedCount }}
                  </dd>
                </div>
                <div class="rounded-lg bg-elevated p-3">
                  <dt class="text-xs text-muted">
                    Delivered
                  </dt><dd class="mt-1 font-semibold text-highlighted">
                    {{ health.delivery.deliveredCount }}
                  </dd>
                </div>
                <div class="rounded-lg bg-elevated p-3">
                  <dt class="text-xs text-muted">
                    Rejected
                  </dt><dd class="mt-1 font-semibold text-highlighted">
                    {{ health.delivery.rejectedCount }}
                  </dd>
                </div>
                <div class="rounded-lg bg-elevated p-3">
                  <dt class="text-xs text-muted">
                    Pending
                  </dt><dd class="mt-1 font-semibold text-highlighted">
                    {{ health.delivery.pendingCount }}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <section class="rounded-xl border border-default bg-default p-5 shadow-xs sm:p-6">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">
                  Provider destinations
                </h2>
                <p class="mt-1 text-sm text-muted">
                  Current readiness without account IDs, sensitive connection details, or technical diagnostics.
                </p>
              </div>
              <span class="text-xs text-muted">{{ health.destinations.length }} configured</span>
            </div>
            <div v-if="health.destinations.length" class="mt-4 divide-y divide-default">
              <div v-for="(destination, index) in health.destinations" :key="`${destination.platform}-${index}`" class="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-sm font-medium text-highlighted">
                      {{ destination.label }}
                    </h3>
                    <UBadge :color="statusColor(destination.status)" variant="subtle">
                      {{ capabilityStatusLabels[destination.status] }}
                    </UBadge>
                    <UBadge color="neutral" variant="outline">
                      {{ titleCase(destination.deliveryState) }}
                    </UBadge>
                  </div>
                </div>
                <p class="text-xs text-muted">
                  Last success: {{ formatDateTime(destination.lastSuccessAt) }}
                </p>
              </div>
            </div>
            <p v-else class="mt-4 rounded-lg bg-elevated p-4 text-sm text-muted">
              Provider destinations are still being mapped.
            </p>
          </section>

          <section v-if="health.nextSteps.length" class="rounded-xl border border-warning/25 bg-warning/5 p-5 sm:p-6">
            <div class="flex gap-3">
              <UIcon name="i-lucide-list-checks" class="mt-0.5 size-5 shrink-0 text-warning" />
              <div>
                <h2 class="font-semibold text-highlighted">
                  What happens next
                </h2>
                <p class="mt-1 text-sm text-muted">
                  These items are owned and monitored by your agency team.
                </p>
                <ul class="mt-3 space-y-2 text-sm text-muted">
                  <li v-for="step in health.nextSteps" :key="step" class="flex gap-2">
                    <span aria-hidden="true">•</span>
                    <span>{{ step }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
