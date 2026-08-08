<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const PmaxOnboardingModal = defineAsyncComponent(
  () => import('./GooglePmaxOnboardingModal.client.vue')
)

interface LaunchCheck {
  code: string
  message: string
  status: 'pass' | 'warning' | 'fail'
}

interface LaunchConfig {
  campaignName?: string
  customerId?: string
  merchantCenterId?: string
  budget?: { currency?: string, allocatedTotal?: number, campaignDays?: number }
  inventoryFilter?: { conditions?: string[] }
  assetGroup?: { mode?: string }
  conversionGoals?: unknown[]
  [key: string]: unknown
}

interface Launch {
  id: string
  clientId: string
  configVersion: number
  configHash: string
  state: string
  normalizedConfig: LaunchConfig
  preflightResult: { checks?: LaunchCheck[], [key: string]: unknown }
  providerResources: Record<string, unknown>
  verificationResult: Record<string, unknown>
  retryFromState: 'EXECUTING' | 'ENABLING' | null
  updatedAt: string
}

interface LaunchListResponse {
  launches: Launch[]
  preparableBriefs: Array<{
    id: string
    clientId: string
    clientName: string
    title: string
    configVersion: number
  }>
  permissions: { canApprove: boolean }
}

const toast = useToast()
const { data, pending, error, refresh } = await useFetch<LaunchListResponse>(
  '/api/agency/social/google/pmax-launches',
  { query: { limit: 100 } }
)

const running = ref<string | null>(null)
const selected = ref<Launch | null>(null)
const onboardingOpen = ref(false)
const approvalOpen = ref(false)
const approvalKind = ref<'create' | 'activate'>('create')
const approvalReason = ref('')
const activationConfirmed = ref(false)
const prepareOpen = ref(false)
const selectedBriefId = ref<string | undefined>()
const preparing = ref(false)

const launches = computed(() => data.value?.launches || [])
const preparableBriefs = computed(() => data.value?.preparableBriefs || [])
const preparableBriefOptions = computed(() => preparableBriefs.value.map(brief => ({
  value: brief.id,
  label: `${brief.clientName} — ${brief.title} (v${brief.configVersion})`
})))
const canApprove = computed(() => data.value?.permissions.canApprove === true)

const stateMeta: Record<string, { label: string, color: 'neutral' | 'info' | 'warning' | 'success' | 'error', icon: string }> = {
  DRAFT: { label: 'Draft', color: 'neutral', icon: 'i-lucide-file-edit' },
  PREFLIGHT_FAILED: { label: 'Blocked', color: 'error', icon: 'i-lucide-octagon-alert' },
  READY_FOR_APPROVAL: { label: 'Create approval needed', color: 'warning', icon: 'i-lucide-shield-question' },
  APPROVED: { label: 'Approved to create paused', color: 'info', icon: 'i-lucide-shield-check' },
  EXECUTING: { label: 'Creating paused', color: 'info', icon: 'i-lucide-loader-2' },
  CREATED_PAUSED: { label: 'Created paused', color: 'warning', icon: 'i-lucide-pause-circle' },
  VERIFIED_PAUSED: { label: 'Verified paused', color: 'success', icon: 'i-lucide-badge-check' },
  ACTIVATION_APPROVED: { label: 'Activation approved', color: 'warning', icon: 'i-lucide-shield-alert' },
  ENABLING: { label: 'Activating', color: 'warning', icon: 'i-lucide-loader-2' },
  ENABLED_VERIFIED: { label: 'Enabled and verified', color: 'success', icon: 'i-lucide-circle-check-big' },
  VERIFICATION_FAILED: { label: 'Readback failed', color: 'error', icon: 'i-lucide-circle-x' },
  FAILED_RETRYABLE: { label: 'Retry required', color: 'error', icon: 'i-lucide-refresh-cw' },
  RECOVERY_REQUIRED: { label: 'Recovery required', color: 'error', icon: 'i-lucide-siren' },
  CANCELLED: { label: 'Cancelled', color: 'neutral', icon: 'i-lucide-circle-slash-2' }
}

function meta(state: string) {
  return stateMeta[state] || { label: state, color: 'neutral' as const, icon: 'i-lucide-circle-help' }
}

function messageOf(cause: unknown, fallback: string) {
  const value = cause as { data?: { statusMessage?: string }, message?: string }
  return value?.data?.statusMessage || value?.message || fallback
}

function money(launch: Launch) {
  const budget = launch.normalizedConfig.budget || {}
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: budget.currency || 'AUD', maximumFractionDigits: 2
  }).format(Number(budget.allocatedTotal || 0))
}

function date(value: string) {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function checks(launch: Launch) {
  return Array.isArray(launch.preflightResult?.checks) ? launch.preflightResult.checks : []
}

async function act(launch: Launch, action: 'preflight' | 'execute' | 'activate') {
  running.value = `${launch.id}:${action}`
  try {
    const labels = {
      preflight: { title: 'Preflight complete', description: 'Provider, feed, onboarding, and platform evidence were reconciled.' },
      execute: { title: 'Campaign created paused', description: 'Google readback verified the exact paused configuration.' },
      activate: { title: 'Campaign activated', description: 'Campaign and asset group are enabled and verified.' }
    }
    await $fetch(`/api/agency/social/google/pmax-launches/${launch.id}/${action}`, { method: 'POST' })
    toast.add({ ...labels[action], color: 'success' })
    await refresh()
  } catch (cause) {
    toast.add({
      title: action === 'activate' ? 'Activation stopped' : 'Launch action stopped',
      description: messageOf(cause, 'The governed action could not be completed.'),
      color: 'error'
    })
  } finally {
    running.value = null
    activationConfirmed.value = false
  }
}

function openOnboarding(launch: Launch) {
  selected.value = launch
  onboardingOpen.value = true
}

function openApproval(launch: Launch, kind: 'create' | 'activate') {
  selected.value = launch
  approvalKind.value = kind
  approvalReason.value = kind === 'create'
    ? 'Approved after reviewing the exact launch configuration and complete preflight evidence.'
    : 'Approved after independently verifying the paused campaign, conversion tracking, Vehicle Ads review, and final launch authority.'
  activationConfirmed.value = false
  approvalOpen.value = true
}

async function approve() {
  if (!selected.value) return
  if (approvalKind.value === 'activate' && !activationConfirmed.value) {
    toast.add({ title: 'Activation acknowledgement required', description: 'Confirm that enabling can begin media spend.', color: 'warning' })
    return
  }
  running.value = `${selected.value.id}:approve`
  try {
    await $fetch(`/api/agency/social/google/pmax-launches/${selected.value.id}/approve`, {
      method: 'POST',
      body: {
        approvalKind: approvalKind.value,
        expectedConfigVersion: selected.value.configVersion,
        expectedConfigHash: selected.value.configHash,
        reason: approvalReason.value
      }
    })
    toast.add({
      title: approvalKind.value === 'create' ? 'Paused creation approved' : 'Activation approved',
      description: 'The approval is bound to the exact configuration version and hash.',
      color: 'success'
    })
    approvalOpen.value = false
    await refresh()
  } catch (cause) {
    toast.add({ title: 'Approval stopped', description: messageOf(cause, 'The approval could not be recorded.'), color: 'error' })
  } finally {
    running.value = null
  }
}

function openPrepare() {
  selectedBriefId.value = preparableBriefs.value[0]?.id
  prepareOpen.value = true
}

function closePrepare() {
  prepareOpen.value = false
}

function closeApproval() {
  approvalOpen.value = false
}

async function prepareLaunch() {
  if (!selectedBriefId.value) {
    toast.add({ title: 'Select an approved brief', color: 'warning' })
    return
  }
  preparing.value = true
  try {
    const result = await $fetch<{ isReplay: boolean }>('/api/agency/social/google/pmax-launches', {
      method: 'POST',
      body: { briefId: selectedBriefId.value }
    })
    toast.add({
      title: result.isReplay ? 'Launch plan already exists' : 'Launch plan prepared',
      description: 'Account, feed, conversion, currency, timezone, and location identities were resolved server-side from the approved brief.',
      color: 'success'
    })
    prepareOpen.value = false
    await refresh()
  } catch (cause) {
    toast.add({
      title: 'Brief is not launch-ready',
      description: messageOf(cause, 'Provider-backed launch evidence could not be resolved.'),
      color: 'error'
    })
  } finally {
    preparing.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div class="flex items-center gap-2 text-xs text-muted">
          <NuxtLink to="/agency/social/google" class="hover:text-default">Google Ads</NuxtLink>
          <UIcon name="i-lucide-chevron-right" class="size-3" />
          <span>Governed launches</span>
        </div>
        <h1 class="mt-2 text-2xl font-bold tracking-tight">
          Google PMax Inventory launches
        </h1>
        <p class="mt-1 max-w-3xl text-sm text-muted">
          Turn approved briefs into paused Vehicle Ads campaigns, reconcile every platform signal, and require a second approval before spend can begin.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UBadge color="success" variant="subtle" icon="i-lucide-cloud">
          Cloudflare-native
        </UBadge>
        <UBadge color="warning" variant="subtle" icon="i-lucide-shield-alert">
          Activation separately gated
        </UBadge>
        <UButton
          v-if="preparableBriefs.length"
          icon="i-lucide-file-plus-2"
          @click="openPrepare"
        >
          Prepare approved brief
        </UButton>
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="pending"
          @click="refresh()"
        >
          Refresh
        </UButton>
      </div>
    </header>

    <UAlert
      color="info"
      variant="subtle"
      title="Whole-platform decision evidence"
      description="Each preflight reconciles the approved brief, boards and tasks, client knowledge, audience and persona signals, spend history, internal vehicle feed, Google Ads, Merchant Center, onboarding attestations, and a cost-capped Cloudflare AI Gateway advisory. Deterministic checks remain authoritative."
    />

    <UAlert
      v-if="error"
      color="error"
      title="Launches unavailable"
      :description="messageOf(error, 'Launches could not be loaded.')"
      :actions="[{ label: 'Try again', onClick: () => refresh() }]"
    />

    <div v-if="pending && !launches.length" class="grid gap-4 lg:grid-cols-2">
      <UCard v-for="index in 4" :key="index">
        <USkeleton class="h-44 w-full" />
      </UCard>
    </div>

    <UCard v-else-if="!launches.length">
      <div class="py-10 text-center">
        <UIcon name="i-lucide-clipboard-list" class="mx-auto size-8 text-muted" />
        <h2 class="mt-3 font-semibold">
          No governed launch plans yet
        </h2>
        <p class="mt-1 text-sm text-muted">
          Approve a provider-complete Google PMax brief, then prepare its immutable launch plan here.
        </p>
        <UButton
          v-if="preparableBriefs.length"
          class="mt-4"
          icon="i-lucide-file-plus-2"
          @click="openPrepare"
        >
          Prepare approved brief
        </UButton>
      </div>
    </UCard>

    <div v-else class="grid gap-4 xl:grid-cols-2">
      <UCard v-for="launch in launches" :key="launch.id" :ui="{ body: 'space-y-5' }">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="truncate font-semibold">
                {{ launch.normalizedConfig.campaignName }}
              </h2>
              <UBadge :color="meta(launch.state).color" variant="subtle" :icon="meta(launch.state).icon">
                {{ meta(launch.state).label }}
              </UBadge>
            </div>
            <p class="mt-1 text-xs text-muted">
              Google Ads {{ launch.normalizedConfig.customerId }} · Merchant {{ launch.normalizedConfig.merchantCenterId }} · v{{ launch.configVersion }}
            </p>
          </div>
          <UBadge color="neutral" variant="outline">
            {{ launch.normalizedConfig.assetGroup?.mode === 'MERCHANT_ONLY' ? 'Feed-led' : 'Provided assets' }}
          </UBadge>
        </div>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p class="text-[11px] font-medium uppercase tracking-wide text-muted">
              Total budget
            </p><p class="mt-1 text-sm font-semibold">
              {{ money(launch) }}
            </p>
          </div>
          <div>
            <p class="text-[11px] font-medium uppercase tracking-wide text-muted">
              Flight
            </p><p class="mt-1 text-sm font-semibold">
              {{ launch.normalizedConfig.budget?.campaignDays }} days
            </p>
          </div>
          <div>
            <p class="text-[11px] font-medium uppercase tracking-wide text-muted">
              Inventory
            </p><p class="mt-1 text-sm font-semibold">
              {{ launch.normalizedConfig.inventoryFilter?.conditions?.join(' + ') }}
            </p>
          </div>
          <div>
            <p class="text-[11px] font-medium uppercase tracking-wide text-muted">
              Conversions
            </p><p class="mt-1 text-sm font-semibold">
              {{ launch.normalizedConfig.conversionGoals?.length || 0 }} exact
            </p>
          </div>
        </div>

        <div v-if="checks(launch).length" class="rounded-lg border border-default bg-elevated/40 p-3">
          <div class="flex items-center justify-between gap-3">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">
              Latest preflight
            </p>
            <span class="text-xs text-muted">{{ checks(launch).filter(item => item.status === 'fail').length }} blockers · {{ checks(launch).filter(item => item.status === 'warning').length }} warnings</span>
          </div>
          <div class="mt-2 space-y-1.5">
            <div v-for="item in checks(launch).filter(check => check.status !== 'pass').slice(0, 3)" :key="item.code" class="flex items-start gap-2 text-xs">
              <UIcon :name="item.status === 'fail' ? 'i-lucide-circle-x' : 'i-lucide-triangle-alert'" class="mt-0.5 size-3.5 shrink-0" :class="item.status === 'fail' ? 'text-error' : 'text-warning'" />
              <span>{{ item.message }}</span>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 border-t border-default pt-4">
          <template v-if="['DRAFT', 'PREFLIGHT_FAILED'].includes(launch.state)">
            <UButton
              v-if="canApprove"
              size="sm"
              color="neutral"
              variant="soft"
              icon="i-lucide-building-2"
              @click="openOnboarding(launch)"
            >
              Attest onboarding
            </UButton>
            <UButton
              size="sm"
              icon="i-lucide-scan-search"
              :loading="running === `${launch.id}:preflight`"
              @click="act(launch, 'preflight')"
            >
              Run preflight
            </UButton>
          </template>
          <UButton
            v-if="launch.state === 'READY_FOR_APPROVAL' && canApprove"
            size="sm"
            icon="i-lucide-shield-check"
            @click="openApproval(launch, 'create')"
          >
            Approve paused creation
          </UButton>
          <UButton
            v-if="launch.state === 'APPROVED' && canApprove"
            size="sm"
            color="warning"
            icon="i-lucide-pause-circle"
            :loading="running === `${launch.id}:execute`"
            @click="act(launch, 'execute')"
          >
            Create paused in Google
          </UButton>
          <UButton
            v-if="launch.state === 'VERIFIED_PAUSED' && canApprove"
            size="sm"
            color="warning"
            variant="soft"
            icon="i-lucide-shield-alert"
            @click="openApproval(launch, 'activate')"
          >
            Approve activation
          </UButton>
          <UButton
            v-if="launch.state === 'ACTIVATION_APPROVED' && canApprove"
            size="sm"
            color="error"
            icon="i-lucide-play"
            :loading="running === `${launch.id}:activate`"
            @click="act(launch, 'activate')"
          >
            Activate campaign
          </UButton>
          <UButton
            v-if="launch.state === 'FAILED_RETRYABLE' && launch.retryFromState === 'EXECUTING' && canApprove"
            size="sm"
            color="warning"
            icon="i-lucide-refresh-cw"
            :loading="running === `${launch.id}:execute`"
            @click="act(launch, 'execute')"
          >
            Retry paused creation
          </UButton>
          <UButton
            v-if="launch.state === 'FAILED_RETRYABLE' && launch.retryFromState === 'ENABLING' && canApprove"
            size="sm"
            color="error"
            icon="i-lucide-refresh-cw"
            :loading="running === `${launch.id}:activate`"
            @click="act(launch, 'activate')"
          >
            Retry activation
          </UButton>
          <span class="ml-auto text-xs text-muted">Updated {{ date(launch.updatedAt) }}</span>
        </div>
      </UCard>
    </div>

    <PmaxOnboardingModal
      v-if="selected"
      v-model:open="onboardingOpen"
      :launch-id="selected.id"
      :config="selected.normalizedConfig"
      @saved="refresh()"
    />

    <UModal v-model:open="prepareOpen" :ui="{ content: 'max-w-xl' }">
      <template #content>
        <div class="p-6">
          <div class="flex items-start gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UIcon name="i-lucide-file-check-2" class="size-5" />
            </div>
            <div>
              <h2 class="text-lg font-semibold">
                Prepare an approved brief
              </h2>
              <p class="mt-1 text-sm text-muted">
                The server re-reads the approved version and resolves every Google, feed, conversion, and PMA identity. Browser-supplied provider evidence is not accepted.
              </p>
            </div>
          </div>
          <div class="mt-5 space-y-4">
            <UFormField label="Approved Google PMax brief" required>
              <USelectMenu
                v-model="selectedBriefId"
                :items="preparableBriefOptions"
                value-key="value"
                placeholder="Select an approved brief"
                class="w-full"
              />
            </UFormField>
            <UAlert
              color="info"
              variant="subtle"
              title="Read-only preparation"
              description="This creates only the internal immutable launch plan. It does not create, change, enable, or spend from any Google campaign."
            />
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="closePrepare">
              Cancel
            </UButton>
            <UButton icon="i-lucide-file-plus-2" :loading="preparing" @click="prepareLaunch">
              Prepare launch plan
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="approvalOpen" :ui="{ content: 'max-w-xl' }">
      <template #content>
        <div class="p-6">
          <div class="flex items-start gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-full" :class="approvalKind === 'activate' ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'">
              <UIcon :name="approvalKind === 'activate' ? 'i-lucide-shield-alert' : 'i-lucide-shield-check'" class="size-5" />
            </div>
            <div>
              <h2 class="text-lg font-semibold">
                {{ approvalKind === 'activate' ? 'Approve spend activation' : 'Approve paused creation' }}
              </h2>
              <p class="mt-1 text-sm text-muted">
                This approval is immutable and bound to configuration v{{ selected?.configVersion }} and its canonical hash.
              </p>
            </div>
          </div>
          <div class="mt-5 space-y-4">
            <UAlert
              v-if="approvalKind === 'activate'"
              color="error"
              variant="subtle"
              title="Media spend can begin"
              description="Only approve after final conversion testing, Google Vehicle Ads reviews, targeting, budget, client authority, and paused readback have all been independently checked."
            />
            <UFormField label="Decision reason">
              <UTextarea v-model="approvalReason" class="w-full" :rows="4" />
            </UFormField>
            <UFormField v-if="approvalKind === 'activate'" label="Spend acknowledgement">
              <UCheckbox v-model="activationConfirmed" label="I understand that the next activation action can begin Google media spend." />
            </UFormField>
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="closeApproval">
              Cancel
            </UButton>
            <UButton :color="approvalKind === 'activate' ? 'error' : 'primary'" :loading="running?.endsWith(':approve')" @click="approve">
              Record approval
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
