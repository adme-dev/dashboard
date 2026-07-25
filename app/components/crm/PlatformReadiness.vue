<script setup lang="ts">
type EntitlementStatus = 'trial' | 'active' | 'grace' | 'capped' | 'overdue' | 'suspended' | 'cancelled' | 'missing'

interface Entitlement {
  featureKey: string
  enabled: boolean
  status: EntitlementStatus
  source: 'override' | 'client' | 'plan' | 'missing'
  limits: Record<string, unknown>
  expiresAt: string | null
}

interface EntitlementsResponse {
  clientId: string
  leadCaptureMode: string
  entitlements: Record<string, Entitlement>
}

interface PlatformReadiness {
  enabled: boolean
  reason?: string
  generatedAt: string
  communications?: {
    sms: { entitled: boolean, ready: boolean, emergencyStopped: boolean }
    voice: { entitled: boolean, ready: boolean, emergencyStopped: boolean }
  }
  receptionist?: {
    globallyEnabled: boolean
    entitled: boolean
    ready: boolean
    status: string
    evaluationStatus: string
    emergencyStopped: boolean
  }
  externalMcp?: {
    globallyEnabled: boolean
    entitled: boolean
    ready: boolean
    activeClients: number
  }
}

interface FeatureDefinition {
  key: string
  label: string
  description: string
}

const apiFetch = useRequestFetch() as <T>(request: string) => Promise<T>
const entitlements = ref<EntitlementsResponse | null>(null)
const readiness = ref<PlatformReadiness | null>(null)
const pending = ref(true)
const loadError = ref<string | null>(null)

const featureGroups: Array<{ label: string, features: FeatureDefinition[] }> = [
  {
    label: 'CRM & intelligence',
    features: [
      { key: 'crm.core', label: 'CRM', description: 'Contacts, companies, opportunities and tasks.' },
      { key: 'crm.external', label: 'External CRM connections', description: 'Governed synchronization with approved CRM providers.' },
      { key: 'catalog.sync', label: 'Product catalogue sync', description: 'Match enquiries to product, stock or vehicle records.' },
      { key: 'mobile.crm', label: 'Mobile CRM', description: 'Dealer and field-team mobile access.' },
      { key: 'persona.identity', label: 'Persona identity', description: 'Consent-aware profiles, reconciliation and audience intelligence.' }
    ]
  },
  {
    label: 'Advertising audiences',
    features: [
      { key: 'audience.google', label: 'Google audiences', description: 'Governed Customer Match audience delivery.' },
      { key: 'audience.meta', label: 'Meta audiences', description: 'Governed Meta Custom Audience delivery.' }
    ]
  },
  {
    label: 'Communications & AI',
    features: [
      { key: 'communications.sms', label: 'SMS', description: 'Provider-routed customer messaging.' },
      { key: 'communications.voice', label: 'Voice', description: 'Provider-routed calling and telephony.' },
      { key: 'ai.receptionist', label: 'AI receptionist', description: 'Industry-configured voice receptionist with human handoff.' },
      { key: 'mcp.crm', label: 'CRM MCP access', description: 'Tenant-scoped CRM access from approved AI clients.' }
    ]
  }
]

const enabledCount = computed(() =>
  Object.values(entitlements.value?.entitlements || {}).filter(item => item.enabled).length
)

const readinessCards = computed(() => {
  if (!readiness.value?.enabled) return []
  const value = readiness.value
  return [
    {
      key: 'sms',
      label: 'SMS',
      icon: 'i-lucide-message-square-text',
      entitled: Boolean(value.communications?.sms.entitled),
      ready: Boolean(value.communications?.sms.ready),
      stopped: Boolean(value.communications?.sms.emergencyStopped)
    },
    {
      key: 'voice',
      label: 'Voice',
      icon: 'i-lucide-phone-call',
      entitled: Boolean(value.communications?.voice.entitled),
      ready: Boolean(value.communications?.voice.ready),
      stopped: Boolean(value.communications?.voice.emergencyStopped)
    },
    {
      key: 'receptionist',
      label: 'AI receptionist',
      icon: 'i-lucide-headphones',
      entitled: Boolean(value.receptionist?.entitled),
      ready: Boolean(value.receptionist?.ready),
      stopped: Boolean(value.receptionist?.emergencyStopped),
      detail: value.receptionist?.entitled
        ? `Configuration: ${titleCase(value.receptionist.status)} · Evaluation: ${titleCase(value.receptionist.evaluationStatus)}`
        : undefined
    },
    {
      key: 'mcp',
      label: 'CRM MCP',
      icon: 'i-lucide-plug-zap',
      entitled: Boolean(value.externalMcp?.entitled),
      ready: Boolean(value.externalMcp?.ready),
      stopped: false,
      detail: value.externalMcp?.entitled
        ? `${value.externalMcp.activeClients} approved client${value.externalMcp.activeClients === 1 ? '' : 's'} active`
        : undefined
    }
  ]
})

function titleCase(value?: string) {
  if (!value) return 'Not configured'
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function entitlementColor(item?: Entitlement) {
  if (item?.enabled) return 'success' as const
  if (item?.status === 'capped' || item?.status === 'overdue') return 'warning' as const
  if (item?.status === 'suspended' || item?.status === 'cancelled') return 'error' as const
  return 'neutral' as const
}

function readinessPresentation(card: { entitled: boolean, ready: boolean, stopped: boolean }) {
  if (!card.entitled) return { label: 'Not included', color: 'neutral' as const, icon: 'i-lucide-minus-circle' }
  if (card.ready) return { label: 'Ready', color: 'success' as const, icon: 'i-lucide-circle-check' }
  if (card.stopped) return { label: 'Safely paused', color: 'warning' as const, icon: 'i-lucide-shield-alert' }
  return { label: 'Provisioning', color: 'info' as const, icon: 'i-lucide-loader-circle' }
}

function errorMessage(error: unknown) {
  const candidate = error as { data?: { statusMessage?: string }, message?: string } | null
  return candidate?.data?.statusMessage || candidate?.message || 'Platform readiness could not be loaded'
}

async function refresh() {
  pending.value = true
  loadError.value = null
  try {
    const [entitlementResult, readinessResult] = await Promise.all([
      apiFetch<EntitlementsResponse>('/api/portal/entitlements'),
      apiFetch<PlatformReadiness>('/api/portal/crm/platform-readiness')
    ])
    entitlements.value = entitlementResult
    readiness.value = readinessResult
  } catch (error: unknown) {
    loadError.value = errorMessage(error)
  } finally {
    pending.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="space-y-6">
    <section class="overflow-hidden rounded-xl border border-default bg-default shadow-xs">
      <div class="bg-gradient-to-r from-emerald-500/10 via-primary/5 to-transparent p-5 sm:p-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="max-w-3xl">
            <div class="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">
              <UIcon name="i-lucide-shield-check" class="size-4 text-emerald-500" />
              Enterprise services
            </div>
            <h2 class="mt-2 text-xl font-semibold text-highlighted">
              Platform readiness
            </h2>
            <p class="mt-2 text-sm leading-6 text-muted">
              Your plan, provider provisioning and safety gates are shown separately. A feature is only ready when every required control has passed.
            </p>
          </div>
          <UButton
            label="Refresh"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :loading="pending"
            @click="refresh"
          />
        </div>
      </div>
    </section>

    <div v-if="pending" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
      <div v-for="index in 4" :key="index" class="h-32 animate-pulse rounded-xl bg-elevated" />
    </div>

    <UAlert
      v-else-if="loadError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Platform readiness unavailable"
      :description="loadError"
    >
      <template #actions>
        <UButton
          label="Try again"
          color="neutral"
          variant="outline"
          size="sm"
          @click="refresh"
        />
      </template>
    </UAlert>

    <template v-else-if="entitlements && readiness">
      <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article
          v-for="card in readinessCards"
          :key="card.key"
          class="rounded-xl border border-default bg-default p-5 shadow-xs"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex size-10 items-center justify-center rounded-lg bg-elevated">
              <UIcon :name="card.icon" class="size-5 text-primary" />
            </div>
            <UBadge
              :color="readinessPresentation(card).color"
              variant="subtle"
              :label="readinessPresentation(card).label"
            />
          </div>
          <h3 class="mt-4 font-medium text-highlighted">
            {{ card.label }}
          </h3>
          <p class="mt-1 text-xs leading-5 text-muted">
            {{ card.detail || (card.entitled ? 'Your agency is completing provider and safety configuration.' : 'This service is not included in the current plan.') }}
          </p>
        </article>
      </section>

      <UAlert
        v-if="!readiness.enabled"
        color="warning"
        variant="subtle"
        icon="i-lucide-lock-keyhole"
        title="Full CRM mode is required"
        description="Enterprise communication and AI services stay disabled until Full CRM mode is enabled for this client."
      />

      <section class="grid gap-5 xl:grid-cols-3">
        <article
          v-for="group in featureGroups"
          :key="group.label"
          class="rounded-xl border border-default bg-default p-5 shadow-xs"
        >
          <div class="flex items-center justify-between gap-3">
            <h3 class="font-semibold text-highlighted">
              {{ group.label }}
            </h3>
            <span class="text-xs text-muted">
              {{ group.features.filter(feature => entitlements.entitlements[feature.key]?.enabled).length }}/{{ group.features.length }} enabled
            </span>
          </div>
          <div class="mt-4 divide-y divide-default">
            <div v-for="feature in group.features" :key="feature.key" class="flex gap-3 py-3 first:pt-0 last:pb-0">
              <UIcon
                :name="entitlements.entitlements[feature.key]?.enabled ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
                :class="entitlements.entitlements[feature.key]?.enabled ? 'text-emerald-500' : 'text-muted'"
                class="mt-0.5 size-4 shrink-0"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-sm font-medium text-highlighted">
                    {{ feature.label }}
                  </p>
                  <UBadge
                    :color="entitlementColor(entitlements.entitlements[feature.key])"
                    variant="subtle"
                    size="xs"
                    :label="titleCase(entitlements.entitlements[feature.key]?.status)"
                  />
                </div>
                <p class="mt-1 text-xs leading-5 text-muted">
                  {{ feature.description }}
                </p>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section class="rounded-xl border border-default bg-default p-5 shadow-xs sm:p-6">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 class="font-semibold text-highlighted">
              Governed activation
            </h3>
            <p class="mt-1 max-w-3xl text-sm leading-6 text-muted">
              Client authorization, person-level consent, provider delivery and CRM outcome measurement remain independent. This prevents an enabled plan from bypassing privacy or safety controls.
            </p>
            <p class="mt-2 text-xs text-dimmed">
              {{ enabledCount }} of {{ Object.keys(entitlements.entitlements).length }} platform capabilities are currently included.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              label="Audience authorization"
              icon="i-lucide-users-round"
              to="/portal/analytics/audiences"
              color="neutral"
              variant="outline"
            />
            <UButton
              label="Measurement health"
              icon="i-lucide-activity"
              to="/portal/measurement"
              color="neutral"
              variant="outline"
            />
            <UButton
              label="Account settings"
              icon="i-lucide-settings"
              to="/portal/settings"
              color="neutral"
              variant="outline"
            />
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
