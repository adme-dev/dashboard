<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

type ProviderKey = 'google_ads' | 'meta'

interface AudienceIntelligence {
  generatedAt: string
  client: { id: string, name: string, canAuthorize: boolean }
  accuracy: {
    totalProfiles: number
    linkedProfiles: number
    matchableProfiles: number
    consentRecordedProfiles: number
    marketingGranted: number
    marketingDenied: number
    marketingUnknown: number
    exportEligible: number
    totalSignals: number
    recentSignals: number
    signalledProfiles: number
    productSignals: number
    identityLinkageRate: number
    matchabilityRate: number
    consentCoverageRate: number
    exportEligibilityRate: number
    lastProfileSeenAt: string | null
    lastConsentAt: string | null
    lastSignalAt: string | null
  }
  sourceMix: Array<{ source: string, count: number, lastSeenAt: string | null }>
  personas: Array<{
    id: string
    key: string
    version: number
    label: string
    description: string
    minConfidence: number
    allowedChannels: string[]
    targetingAllowed: boolean
    reportingAllowed: boolean
    updatedAt: string
  }>
  providers: Array<{
    provider: ProviderKey
    connected: boolean
    credentialReady: boolean
    activeConnections: number
    authorization: 'pending' | 'accepted' | 'withdrawn'
    policyVersion: string | null
    authorizedByName: string | null
    acceptedAt: string | null
    withdrawnAt: string | null
    privacyNoticeUrl: string | null
    ready: boolean
  }>
  activations: Array<{
    id: string
    provider: ProviderKey
    name: string
    status: string
    estimatedSize: number
    minimumSize: number
    blockedReason: string | null
    approverCount: number
    providerEnabled: boolean
    emergencyStop: boolean
    lastSyncedAt: string | null
    lastError: string | null
    exportStatus: string | null
    successfulAdditions: number
    successfulRemovals: number
    exportCompletedAt: string | null
    exportError: string | null
  }>
  warnings: Array<{ code: string, message: string }>
}

const { data, status, error, refresh } = await useFetch<AudienceIntelligence>(
  '/api/portal/analytics/audiences',
  { credentials: 'include' }
)

const authorizationProvider = ref<ProviderKey | null>(null)
const privacyNoticeUrl = ref('')
const attestations = reactive({
  dataOwnership: false,
  privacyNotice: false,
  providerTerms: false,
  personConsentSeparate: false
})
const saving = ref(false)
const actionError = ref('')

const providerLabels: Record<ProviderKey, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta'
}
const providerIcons: Record<ProviderKey, string> = {
  google_ads: 'i-simple-icons-googleads',
  meta: 'i-simple-icons-meta'
}

const fmtNumber = (value: number) => new Intl.NumberFormat('en-AU').format(value || 0)
const fmtPercent = (value: number) => `${Math.round((value || 0) * 100)}%`
const fmtDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Not recorded'

const allAttested = computed(() => Object.values(attestations).every(Boolean))
const accuracyCards = computed(() => {
  const accuracy = data.value?.accuracy
  if (!accuracy) return []
  return [
    {
      label: 'Identity profiles',
      value: fmtNumber(accuracy.totalProfiles),
      detail: `${fmtNumber(accuracy.linkedProfiles)} linked to CRM or lead identities`,
      icon: 'i-lucide-users'
    },
    {
      label: 'Signals collected',
      value: fmtNumber(accuracy.totalSignals),
      detail: `${fmtNumber(accuracy.recentSignals)} in the last 30 days`,
      icon: 'i-lucide-activity'
    },
    {
      label: 'Marketing consent',
      value: fmtNumber(accuracy.marketingGranted),
      detail: `${fmtNumber(accuracy.marketingDenied)} denied or opted out`,
      icon: 'i-lucide-shield-check'
    },
    {
      label: 'Provider eligible',
      value: fmtNumber(accuracy.exportEligible),
      detail: 'Consented, matchable and not suppressed',
      icon: 'i-lucide-send'
    }
  ]
})
const coverageRows = computed(() => {
  const accuracy = data.value?.accuracy
  if (!accuracy) return []
  return [
    { label: 'Known identity linkage', value: accuracy.identityLinkageRate, count: accuracy.linkedProfiles },
    { label: 'Email or phone matchability', value: accuracy.matchabilityRate, count: accuracy.matchableProfiles },
    { label: 'Consent evidence coverage', value: accuracy.consentCoverageRate, count: accuracy.consentRecordedProfiles },
    { label: 'Current export eligibility', value: accuracy.exportEligibilityRate, count: accuracy.exportEligible }
  ]
})

function beginAuthorization(provider: ProviderKey) {
  authorizationProvider.value = provider
  actionError.value = ''
  const current = data.value?.providers.find(item => item.provider === provider)
  privacyNoticeUrl.value = current?.privacyNoticeUrl || ''
  Object.assign(attestations, {
    dataOwnership: false,
    privacyNotice: false,
    providerTerms: false,
    personConsentSeparate: false
  })
}

async function saveAuthorization(action: 'accept' | 'withdraw', provider?: ProviderKey) {
  const selectedProvider = provider || authorizationProvider.value
  if (!selectedProvider) return
  saving.value = true
  actionError.value = ''
  try {
    await $fetch('/api/portal/analytics/audiences/authorization', {
      method: 'PUT',
      credentials: 'include',
      body: {
        provider: selectedProvider,
        action,
        privacyNoticeUrl: privacyNoticeUrl.value || null,
        ...attestations
      }
    })
    authorizationProvider.value = null
    await refresh()
  } catch (caught: any) {
    actionError.value = caught?.data?.statusMessage || caught?.message || 'Authorization update failed'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="w-full space-y-6 p-4 sm:p-6 lg:p-8">
    <header class="flex flex-col gap-4 border-b border-default pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div class="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted">
          <UIcon name="i-lucide-orbit" class="size-4 text-emerald-500" />
          Customer intelligence
        </div>
        <h1 class="text-3xl font-semibold tracking-tight text-default">
          Personas & audiences
        </h1>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-muted">
          See how website behaviour, CRM identities, product interest and consent become governed audiences for advertising.
        </p>
      </div>
      <UButton
        label="Refresh intelligence"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="status === 'pending'"
        @click="refresh()"
      />
    </header>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Audience intelligence is unavailable"
      :description="error.message"
    />

    <template v-if="data">
      <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UCard v-for="card in accuracyCards" :key="card.label">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-wider text-muted">
                {{ card.label }}
              </p>
              <p class="mt-2 text-3xl font-semibold tabular-nums text-default">
                {{ card.value }}
              </p>
              <p class="mt-2 text-xs text-muted">
                {{ card.detail }}
              </p>
            </div>
            <div class="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-500">
              <UIcon :name="card.icon" class="size-5" />
            </div>
          </div>
        </UCard>
      </section>

      <section v-if="data.warnings.length" class="space-y-2">
        <UAlert
          v-for="warning in data.warnings"
          :key="warning.code"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="warning.message"
        />
      </section>

      <section class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-default">
                Data accuracy & coverage
              </h2>
              <p class="mt-1 text-xs text-muted">
                Coverage is reported, not inferred. Unknown identities and consent remain excluded.
              </p>
            </div>
          </template>
          <div class="space-y-5">
            <div v-for="row in coverageRows" :key="row.label">
              <div class="mb-2 flex items-center justify-between gap-3 text-sm">
                <span class="text-default">{{ row.label }}</span>
                <span class="font-medium tabular-nums text-muted">
                  {{ fmtNumber(row.count) }} · {{ fmtPercent(row.value) }}
                </span>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-elevated">
                <div
                  class="h-full rounded-full bg-emerald-500 transition-[width] duration-700"
                  :style="{ width: `${Math.min(100, Math.round(row.value * 100))}%` }"
                />
              </div>
            </div>
            <div class="grid gap-3 border-t border-default pt-4 text-xs text-muted sm:grid-cols-3">
              <div>
                <span class="block uppercase tracking-wider">Latest profile</span>
                <strong class="mt-1 block font-medium text-default">{{ fmtDate(data.accuracy.lastProfileSeenAt) }}</strong>
              </div>
              <div>
                <span class="block uppercase tracking-wider">Latest signal</span>
                <strong class="mt-1 block font-medium text-default">{{ fmtDate(data.accuracy.lastSignalAt) }}</strong>
              </div>
              <div>
                <span class="block uppercase tracking-wider">Latest consent</span>
                <strong class="mt-1 block font-medium text-default">{{ fmtDate(data.accuracy.lastConsentAt) }}</strong>
              </div>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-default">
                Signal mix
              </h2>
              <p class="mt-1 text-xs text-muted">
                Canonical first-party signals used for persona reporting.
              </p>
            </div>
          </template>
          <div v-if="data.sourceMix.length" class="divide-y divide-default">
            <div
              v-for="source in data.sourceMix"
              :key="String(source.source)"
              class="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium capitalize text-default">
                  {{ String(source.source).replaceAll('_', ' ') }}
                </p>
                <p class="text-xs text-muted">
                  Last seen {{ fmtDate(source.lastSeenAt) }}
                </p>
              </div>
              <span class="rounded-full bg-elevated px-2.5 py-1 text-xs font-medium tabular-nums text-default">
                {{ fmtNumber(source.count) }}
              </span>
            </div>
          </div>
          <p v-else class="py-8 text-center text-sm text-muted">
            No normalized persona signals are available yet.
          </p>
        </UCard>
      </section>

      <section>
        <div class="mb-3">
          <h2 class="text-lg font-semibold text-default">
            Advertising authorization
          </h2>
          <p class="mt-1 text-sm text-muted">
            Client authorization and person-level consent are separate controls. Both must pass before any identifiers are added.
          </p>
        </div>
        <div class="grid gap-4 lg:grid-cols-2">
          <UCard v-for="provider in data.providers" :key="provider.provider">
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-start gap-3">
                <div class="rounded-xl bg-elevated p-2.5">
                  <UIcon :name="providerIcons[provider.provider]" class="size-5 text-default" />
                </div>
                <div>
                  <h3 class="font-semibold text-default">
                    {{ providerLabels[provider.provider] }}
                  </h3>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <UBadge
                      :color="provider.credentialReady ? 'success' : 'warning'"
                      variant="subtle"
                      :label="provider.credentialReady ? 'Connection ready' : 'Connection required'"
                    />
                    <UBadge
                      :color="provider.authorization === 'accepted' ? 'success' : provider.authorization === 'withdrawn' ? 'error' : 'neutral'"
                      variant="subtle"
                      :label="provider.authorization === 'accepted' ? 'Client authorized' : provider.authorization === 'withdrawn' ? 'Authorization withdrawn' : 'Authorization pending'"
                    />
                  </div>
                </div>
              </div>
              <UIcon
                :name="provider.ready ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
                :class="provider.ready ? 'text-emerald-500' : 'text-muted'"
                class="size-6"
              />
            </div>
            <div class="mt-5 rounded-xl border border-default bg-elevated/40 p-3 text-xs text-muted">
              <p v-if="provider.acceptedAt">
                Authorized by {{ provider.authorizedByName || 'client contact' }} on {{ fmtDate(provider.acceptedAt) }}.
              </p>
              <p v-else>
                Authorization has not been recorded for this provider.
              </p>
            </div>
            <div v-if="data.client.canAuthorize" class="mt-4 flex justify-end gap-2">
              <UButton
                v-if="provider.authorization === 'accepted'"
                label="Withdraw"
                color="error"
                variant="ghost"
                size="sm"
                :loading="saving"
                @click="saveAuthorization('withdraw', provider.provider)"
              />
              <UButton
                v-else
                label="Review & authorize"
                icon="i-lucide-shield-check"
                size="sm"
                @click="beginAuthorization(provider.provider)"
              />
            </div>
          </UCard>
        </div>
      </section>

      <section class="grid gap-6 xl:grid-cols-2">
        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-default">
                Active persona definitions
              </h2>
              <p class="mt-1 text-xs text-muted">
                Versioned definitions determine reporting and targeting eligibility.
              </p>
            </div>
          </template>
          <div v-if="data.personas.length" class="space-y-3">
            <div
              v-for="persona in data.personas"
              :key="persona.id"
              class="rounded-xl border border-default p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="text-sm font-semibold text-default">
                    {{ persona.label }}
                  </h3>
                  <p class="mt-1 text-xs leading-5 text-muted">
                    {{ persona.description }}
                  </p>
                </div>
                <UBadge variant="subtle" color="neutral" :label="`v${persona.version}`" />
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <UBadge
                  :color="persona.targetingAllowed ? 'success' : 'neutral'"
                  variant="subtle"
                  :label="persona.targetingAllowed ? 'Targeting allowed' : 'Reporting only'"
                />
                <UBadge
                  v-for="channel in persona.allowedChannels"
                  :key="channel"
                  variant="outline"
                  color="neutral"
                  :label="channel"
                />
              </div>
            </div>
          </div>
          <p v-else class="py-8 text-center text-sm text-muted">
            No active persona definitions are assigned to this client.
          </p>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-default">
                Provider activation & sync
              </h2>
              <p class="mt-1 text-xs text-muted">
                Agency approval, privacy thresholds and emergency controls remain enforced.
              </p>
            </div>
          </template>
          <div v-if="data.activations.length" class="space-y-3">
            <div
              v-for="activation in data.activations"
              :key="activation.id"
              class="rounded-xl border border-default p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-default">
                    {{ activation.name }}
                  </p>
                  <p class="mt-1 text-xs text-muted">
                    {{ providerLabels[activation.provider] }} · {{ fmtNumber(activation.estimatedSize) }} estimated members
                  </p>
                </div>
                <UBadge
                  :color="activation.status === 'active' ? 'success' : activation.status === 'blocked' ? 'warning' : 'neutral'"
                  variant="subtle"
                  :label="activation.status"
                />
              </div>
              <p v-if="activation.blockedReason" class="mt-3 text-xs text-amber-600 dark:text-amber-400">
                {{ activation.blockedReason }}
              </p>
              <div class="mt-4 grid grid-cols-3 gap-3 border-t border-default pt-3 text-xs">
                <div>
                  <span class="block text-muted">Approvers</span>
                  <strong class="mt-1 block text-default">{{ activation.approverCount }}/2</strong>
                </div>
                <div>
                  <span class="block text-muted">Last export</span>
                  <strong class="mt-1 block capitalize text-default">{{ activation.exportStatus || 'Not run' }}</strong>
                </div>
                <div>
                  <span class="block text-muted">Last sync</span>
                  <strong class="mt-1 block text-default">{{ fmtDate(activation.lastSyncedAt) }}</strong>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="py-8 text-center">
            <UIcon name="i-lucide-layers-3" class="mx-auto size-8 text-muted" />
            <p class="mt-3 text-sm font-medium text-default">
              No provider audiences requested
            </p>
            <p class="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted">
              Complete client authorization first. Your agency can then define a privacy-safe cohort and complete two-person approval.
            </p>
          </div>
        </UCard>
      </section>
    </template>

    <UModal
      :open="Boolean(authorizationProvider)"
      title="Authorize advertising audiences"
      description="Record client-controller authorization for this provider. Individual consent and suppression remain independently enforced."
      @update:open="value => { if (!value) authorizationProvider = null }"
    >
      <template #body>
        <div v-if="authorizationProvider" class="space-y-5">
          <UAlert
            color="info"
            variant="subtle"
            icon="i-lucide-info"
            :title="providerLabels[authorizationProvider]"
            description="This authorization permits XeroFlow to prepare and synchronize eligible first-party audience members for your connected provider account."
          />
          <UFormField label="Privacy notice URL" hint="Optional, HTTPS only">
            <UInput
              v-model="privacyNoticeUrl"
              type="url"
              placeholder="https://example.com/privacy"
              class="w-full"
            />
          </UFormField>
          <div class="space-y-3">
            <UCheckbox
              v-model="attestations.dataOwnership"
              label="We own or are authorized to use the first-party customer data represented here."
            />
            <UCheckbox
              v-model="attestations.privacyNotice"
              label="Our privacy notice explains relevant measurement, matching and advertising uses."
            />
            <UCheckbox
              v-model="attestations.providerTerms"
              label="We accept the connected provider's customer-list and custom-audience terms."
            />
            <UCheckbox
              v-model="attestations.personConsentSeparate"
              label="We understand this does not override individual consent, suppression or opt-out records."
            />
          </div>
          <UAlert
            v-if="actionError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="actionError"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="authorizationProvider = null" />
          <UButton
            label="Accept & authorize"
            icon="i-lucide-shield-check"
            :disabled="!allAttested"
            :loading="saving"
            @click="saveAuthorization('accept')"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
