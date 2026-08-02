<script setup lang="ts">
import type { SiteIntelligenceDomain, SiteIntelligenceRun } from '~/types/site-intelligence'

definePageMeta({
  layout: 'agency',
  middleware: ['role-media']
})

useHead({
  title: 'Site Intelligence · XeroFlow Agency'
})

const {
  filters,
  overview,
  changes,
  gaps,
  runDetail,
  status,
  errors,
  updateFilters,
  refreshOverview,
  refreshChanges,
  refreshGaps,
  loadRun,
  crawlDomain,
  mergeDomain
} = useSiteIntelligence()
const { isAdmin } = useAuth()
const toast = useToast()

const laneOptions = [
  { label: 'All evidence lanes', value: 'all' },
  { label: 'Client-owned', value: 'owned' },
  { label: 'Public competitor', value: 'competitor' }
]
const changeOptions = [
  { label: 'All material changes', value: 'all' },
  { label: 'New pages', value: 'page_added' },
  { label: 'Changed facts', value: 'facts_changed' }
]

const availableClients = computed(() => overview.value?.availableClients ?? [])
const showDomainModal = ref(false)
const editingDomain = ref<SiteIntelligenceDomain | null>(null)
const crawlTarget = ref<SiteIntelligenceDomain | null>(null)
const crawlPending = ref(false)
const runOpen = ref(false)
const crawlModalOpen = computed({
  get: () => Boolean(crawlTarget.value),
  set: (value: boolean) => {
    if (!value) crawlTarget.value = null
  }
})

const partialCoverage = computed(() => Boolean(overview.value && (
  overview.value.coverage.blocked
  || overview.value.coverage.failed
  || overview.value.coverage.neverRun
)))

function openAddDomain() {
  editingDomain.value = null
  showDomainModal.value = true
}

function openEditDomain(domain: SiteIntelligenceDomain) {
  editingDomain.value = domain
  showDomainModal.value = true
}

function savedDomain(domain: SiteIntelligenceDomain) {
  mergeDomain(domain)
  toast.add({
    title: 'Monitoring boundary saved',
    description: `${domain.name} is ready for governed collection.`,
    color: 'success'
  })
}

function updateLane(value: unknown) {
  if (value === 'all' || value === 'owned' || value === 'competitor') {
    updateFilters({ lane: value })
  }
}

function updateChangeType(value: unknown) {
  if (value === 'all' || value === 'page_added' || value === 'facts_changed') {
    updateFilters({ changeType: value })
  }
}

async function inspectRun(run: SiteIntelligenceRun) {
  runOpen.value = true
  await loadRun(run.id)
}

async function confirmCrawl() {
  const domain = crawlTarget.value
  if (!domain || crawlPending.value) return
  crawlPending.value = true
  try {
    const run = await crawlDomain(domain.id)
    crawlTarget.value = null
    toast.add({
      title: 'Crawl queued',
      description: `${domain.name} is now collecting its approved public pages.`,
      color: 'success'
    })
    await inspectRun(run)
  } catch (error: unknown) {
    const candidate = error as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: 'Crawl could not start',
      description: candidate?.data?.statusMessage || candidate?.message || 'Review the domain state and try again.',
      color: 'error'
    })
  } finally {
    crawlPending.value = false
  }
}

async function retryNearbyCrawl(domain: Record<string, unknown>) {
  if (typeof domain.id !== 'string') return
  try {
    const run = await crawlDomain(domain.id)
    toast.add({
      title: 'Crawl retry queued',
      description: 'The approved competitor is now using the existing governed crawl path.',
      color: 'success'
    })
    await inspectRun(run)
  } catch (error: unknown) {
    const candidate = error as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: 'Crawl retry could not start',
      description: candidate.data?.statusMessage || candidate.message || 'Open run diagnostics and try again.',
      color: 'error'
    })
  }
}

async function viewNearbyDiagnostics(
  domain: Record<string, unknown>,
  run: Record<string, unknown> | null
) {
  if (typeof run?.id === 'string') {
    runOpen.value = true
    await loadRun(run.id)
    return
  }
  const existing = overview.value?.runs.find(candidate => candidate.domainId === domain.id)
  if (existing) {
    await inspectRun(existing)
    return
  }
  document.getElementById('site-intelligence-run-diagnostics')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  })
}
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto overscroll-y-contain space-y-6 p-4 sm:p-6">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div class="max-w-3xl">
        <div class="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-primary">
          <span class="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          Automotive evidence desk
        </div>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
          Site intelligence
        </h1>
        <p class="mt-2 text-sm leading-6 text-muted">
          Connect current client-site outcomes with approved public competitor offers and content changes—without estimating third-party performance.
        </p>
      </div>
      <div class="flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-lucide-shield-check" class="size-4 text-success" />
        Read-only, source-linked evidence
      </div>
    </div>

    <AnalyticsSectionNav active="intelligence" :query="$route.query" />

    <AnalyticsAudiencesFilterBar
      :from="filters.from"
      :to="filters.to"
      :client-id="filters.clientId"
      :available-clients="availableClients"
      @update:from="updateFilters({ from: $event })"
      @update:to="updateFilters({ to: $event })"
      @update:client-id="updateFilters({ clientId: $event })"
    />

    <UCard>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UFormField label="Evidence lane">
          <USelectMenu
            :model-value="filters.lane"
            :items="laneOptions"
            value-key="value"
            class="w-full"
            @update:model-value="updateLane"
          />
        </UFormField>
        <UFormField label="Change feed">
          <USelectMenu
            :model-value="filters.changeType"
            :items="changeOptions"
            value-key="value"
            class="w-full"
            @update:model-value="updateChangeType"
          />
        </UFormField>
      </div>
    </UCard>

    <AnalyticsAudiencesIntelligenceNearbyMarketPanel
      :client-id="filters.clientId"
      :clients="availableClients"
      :can-manage="isAdmin"
      @update:client-id="updateFilters({ clientId: $event })"
      @retry-crawl="retryNearbyCrawl"
      @view-diagnostics="viewNearbyDiagnostics"
    />

    <UAlert
      v-if="status.overview === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Site intelligence overview could not be refreshed"
      :description="errors.overview || 'Existing change and gap evidence may still be available.'"
    >
      <template #actions>
        <UButton
          label="Retry overview"
          color="error"
          variant="soft"
          size="sm"
          @click="refreshOverview()"
        />
      </template>
    </UAlert>

    <template v-if="status.overview === 'pending' && !overview">
      <USkeleton class="h-44 w-full rounded-xl" />
      <USkeleton class="h-64 w-full rounded-xl" />
    </template>

    <template v-if="overview">
      <UAlert
        v-if="partialCoverage"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Partial collection coverage"
        description="Some approved domains have not run, failed, or were blocked or disallowed. Open run diagnostics before acting on apparent gaps."
      />

      <AnalyticsAudiencesIntelligenceCoverageSummary
        :coverage="overview.coverage"
        :domains="overview.domains"
        :runs="overview.runs"
      />

      <UAlert
        v-if="!overview.domains.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-globe-lock"
        title="No monitored domains configured"
        description="Add an approved client-owned or public competitor domain to establish the first evidence boundary."
      >
        <template v-if="isAdmin" #actions>
          <UButton
            label="Add domain"
            icon="i-lucide-plus"
            size="sm"
            @click="openAddDomain"
          />
        </template>
      </UAlert>

      <UAlert
        v-else-if="!overview.runs.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-scan-search"
        title="Collection has not started"
        description="Run an active approved domain to build the first current fact set."
      />

      <UAlert
        v-if="overview.runs.length && !overview.insights.length && status.overview !== 'pending'"
        color="neutral"
        variant="subtle"
        icon="i-lucide-badge-check"
        title="No material intelligence in this range"
        description="Collection is available, but no deterministic rule crossed an evidence threshold."
      />
      <AnalyticsAudiencesIntelligenceInsightFeed
        v-else
        :insights="overview.insights"
        :loading="status.overview === 'pending'"
      />
    </template>

    <UAlert
      v-if="status.gaps === 'error'"
      color="error"
      variant="subtle"
      title="Gap comparisons could not be refreshed"
      :description="errors.gaps || 'Overview and change evidence remain available.'"
    >
      <template #actions>
        <UButton
          label="Retry gaps"
          color="error"
          variant="soft"
          size="sm"
          @click="refreshGaps()"
        />
      </template>
    </UAlert>
    <AnalyticsAudiencesIntelligenceOfferGapTable
      v-if="gaps || status.gaps === 'pending'"
      :rows="gaps?.rows ?? []"
      :loading="status.gaps === 'pending'"
    />

    <UAlert
      v-if="status.changes === 'error'"
      color="error"
      variant="subtle"
      title="Change evidence could not be refreshed"
      :description="errors.changes || 'Overview and gap evidence remain available.'"
    >
      <template #actions>
        <UButton
          label="Retry changes"
          color="error"
          variant="soft"
          size="sm"
          @click="refreshChanges()"
        />
      </template>
    </UAlert>
    <AnalyticsAudiencesIntelligenceChangeFeed
      v-if="changes || status.changes === 'pending'"
      :rows="changes?.rows ?? []"
      :loading="status.changes === 'pending'"
    />

    <AnalyticsAudiencesIntelligenceRunDiagnostics
      v-if="overview"
      id="site-intelligence-run-diagnostics"
      :runs="overview.runs"
      :domains="overview.domains"
      :loading="status.overview === 'pending'"
      :can-manage="isAdmin"
      @inspect="inspectRun"
      @crawl="crawlTarget = $event"
    />

    <AnalyticsAudiencesIntelligenceDomainTable
      v-if="overview"
      :domains="overview.domains"
      :loading="status.overview === 'pending'"
      :can-manage="isAdmin"
      @add="openAddDomain"
      @edit="openEditDomain"
      @crawl="crawlTarget = $event"
    />

    <AnalyticsAudiencesIntelligenceDomainModal
      v-model:open="showDomainModal"
      :clients="availableClients"
      :domain="editingDomain"
      @saved="savedDomain"
    />

    <UModal v-model:open="crawlModalOpen" title="Confirm governed crawl">
      <template #content>
        <div class="p-5 sm:p-6">
          <h2 class="text-lg font-semibold text-highlighted">
            Confirm governed crawl
          </h2>
          <p class="mt-2 text-sm leading-6 text-muted">
            XeroFlow will collect only approved public pages for <strong class="text-highlighted">{{ crawlTarget?.name }}</strong> and respect access controls and declared policy signals.
          </p>
          <div class="mt-6 flex justify-end gap-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              @click="crawlTarget = null"
            />
            <UButton
              label="Start crawl"
              icon="i-lucide-scan-search"
              :loading="crawlPending"
              @click="confirmCrawl"
            />
          </div>
        </div>
      </template>
    </UModal>

    <USlideover v-model:open="runOpen" title="Run diagnostics">
      <template #content>
        <div class="space-y-5 p-5 sm:p-6">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              Run diagnostics
            </h2>
            <p class="mt-1 text-sm text-muted">
              Review bounded operational evidence without raw page bodies or credentials.
            </p>
          </div>
          <USkeleton v-if="status.run === 'pending'" class="h-44 w-full rounded-lg" />
          <UAlert
            v-else-if="status.run === 'error'"
            color="error"
            variant="subtle"
            title="Run details unavailable"
            :description="errors.run || undefined"
          />
          <template v-else-if="runDetail">
            <div class="rounded-lg border border-default bg-elevated p-4">
              <p class="font-medium text-highlighted">
                {{ runDetail.domain.name }}
              </p>
              <p class="mt-1 text-sm text-muted">
                {{ runDetail.run.status }} · {{ runDetail.run.completedPages }} completed · {{ runDetail.run.erroredPages }} errored
              </p>
            </div>
            <UAlert
              v-if="runDetail.run.status === 'blocked'"
              color="warning"
              variant="subtle"
              title="Collection stopped at the public boundary"
              description="The site or its declared policy disallowed collection. Review the evidence; no circumvention action is available."
            />
            <AnalyticsAudiencesIntelligenceChangeFeed :rows="runDetail.recentChanges" />
          </template>
        </div>
      </template>
    </USlideover>
  </div>
</template>
