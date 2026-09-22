<script setup lang="ts">
import { domainReady, launchReadiness, type PageStudioLaunchState, type LaunchReadinessItem } from '~~/shared/pageStudio/launchReadiness'
import type { PageStudioEmailState } from '~~/shared/pageStudio/emailConfiguration'

interface SiteSummary {
  clientId?: string
  id: string
  name: string
  route: string
  starterVersion: string
  status: string
}

interface ReleaseSummary {
  id: string
  siteId?: string
  status: string
  environment?: string
  hostname?: string
  createdAt?: string | null
}

interface ReviewSummary {
  id: string
  siteId?: string
  versionId?: string
  versionDigest?: string
  decision: string
  decidedAt?: string | null
}

interface DomainSummary {
  dnsStatus?: string
  tlsStatus?: string
  hostnameStatus?: string
  id: string
  siteId?: string
  hostname: string
  environment: string
  status: string
}

type CollectionResponse<T> = {
  items?: T[]
  sites?: T[]
  releases?: T[]
  reviews?: T[]
  domains?: T[]
}

const props = defineProps<{ siteId: string }>()
const toast = useToast()
const { editorOrigin, launchPageStudio } = usePageStudioLauncher()
const publishModalOpen = ref(false)
const publishing = ref(false)
const launchingStudio = ref(false)
const selectedTab = ref('overview')
const publishCandidate = ref<{ versionId: string, checkpointId: string, digest: string, hostname: string, releaseId: string | null } | null>(null)
const { data: launchData, status: launchStatus, error: launchError, refresh: refreshLaunch } = await useFetch<PageStudioLaunchState>(() => `/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/launch-state`)
const { data: emailData, error: emailError, refresh: refreshEmail } = await useFetch<PageStudioEmailState>(() => `/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/email`)

const { data: sitesData, status: sitesStatus, error: sitesError, refresh: refreshSites } = await useFetch<CollectionResponse<SiteSummary>>('/api/agency/page-studio/sites')
const { data: releasesData, error: releasesError, refresh: refreshReleases } = await useFetch<CollectionResponse<ReleaseSummary>>('/api/agency/page-studio/releases')
const { data: reviewsData, error: reviewsError, refresh: refreshReviews } = await useFetch<CollectionResponse<ReviewSummary>>('/api/agency/page-studio/reviews')
const { data: domainsData, status: domainsStatus, error: domainsError, refresh: refreshDomains } = await useFetch<{ siteId: string, domains: Omit<DomainSummary, 'environment'>[] }>(() => `/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/domains`)

function rows<T>(value: CollectionResponse<T> | null | undefined, key: keyof CollectionResponse<T>): T[] {
  const keyed = value?.[key] as T[] | undefined
  return Array.isArray(keyed) ? keyed : (value?.items || [])
}

const site = computed(() => rows<SiteSummary>(sitesData.value, 'sites').find(item => item.id === props.siteId))
const releases = computed(() => releasesError.value ? [] : rows<ReleaseSummary>(releasesData.value, 'releases').filter(item => item.siteId === props.siteId))
const reviews = computed(() => reviewsError.value ? [] : rows<ReviewSummary>(reviewsData.value, 'reviews').filter(item => item.siteId === props.siteId))
const domainsUnavailable = computed(() => Boolean(domainsError.value || (domainsStatus.value !== 'pending' && domainsData.value?.siteId !== props.siteId)))
// The site-scoped domain service returns production attachments only.
const domains = computed<DomainSummary[]>(() => domainsUnavailable.value || domainsData.value?.siteId !== props.siteId ? [] : domainsData.value.domains.map(domain => ({ ...domain, environment: 'production' })))
const activeRelease = computed(() => !launchError.value ? launchData.value?.activeReleases.find(release => !productionDomain.value || release.hostname === productionDomain.value.hostname) : undefined)
const approvedCount = computed(() => reviews.value.filter(review => review.decision === 'approved').length)
const approvedReview = computed(() => !launchError.value && launchData.value?.approvedVersionId ? { versionId: launchData.value.approvedVersionId } : undefined)
const productionDomain = computed(() => !domainsError.value ? domains.value.find(domainReady) : undefined)
const canPublish = computed(() => Boolean(!loading.value && !failed.value && !releasesError.value && !reviewsError.value && approvedReview.value?.versionId && productionDomain.value?.hostname && launchData.value?.plan.status === 'ready'))
const loading = computed(() => [sitesStatus, domainsStatus, launchStatus].some(state => state.value === 'pending'))
const failed = computed(() => Boolean(launchError.value || (launchData.value && launchData.value.siteId !== props.siteId) || (!launchData.value && sitesError.value)))

const readinessItems = computed(() => launchReadiness({ state: launchData.value, stateFailed: Boolean(launchError.value), domains: domains.value, domainsFailed: domainsUnavailable.value, email: emailData.value, emailFailed: Boolean(emailError.value) }))
function navigateReadiness(target: LaunchReadinessItem['target']) {
  if (target === 'studio') void openStudio()
  else selectedTab.value = target
}

const tabs = [
  { label: 'Overview', value: 'overview', slot: 'overview' as const },
  { label: 'Pages', value: 'pages', slot: 'pages' as const },
  { label: 'History', value: 'history', slot: 'history' as const },
  { label: 'Assets', value: 'assets', slot: 'assets' as const },
  { label: 'Forms', value: 'forms', slot: 'forms' as const },
  { label: 'Analytics', value: 'analytics', slot: 'analytics' as const },
  { label: 'Builds', value: 'builds', slot: 'builds' as const },
  { label: 'Releases', value: 'releases', slot: 'releases' as const },
  { label: 'Domains', value: 'domains', slot: 'domains' as const },
  { label: 'Settings', value: 'settings', slot: 'settings' as const }
]

function formatDate(value?: string | null) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

async function refreshAll() {
  await Promise.all([refreshSites(), refreshReleases(), refreshReviews(), refreshDomains(), refreshLaunch(), refreshEmail()])
  toast.add({ title: 'Site refreshed', description: 'The latest control-plane state is now shown.', color: 'success' })
}

function openPublishModal() {
  const state = launchData.value
  if (!canPublish.value || !state?.approvedVersionId || !state.checkpointId || !state.digest || !productionDomain.value) return
  publishCandidate.value = { versionId: state.approvedVersionId, checkpointId: state.checkpointId, digest: state.digest, hostname: productionDomain.value.hostname, releaseId: activeRelease.value?.id ?? null }
  publishModalOpen.value = true
}

async function openStudio() {
  if (launchingStudio.value) return
  launchingStudio.value = true
  try {
    await launchPageStudio(props.siteId)
  } catch (error: unknown) {
    const failure = error as { data?: { statusMessage?: string, message?: string }, message?: string }
    toast.add({
      title: 'Page Studio did not open',
      description: failure.data?.statusMessage || failure.data?.message || failure.message || 'Try again or check the editor configuration.',
      color: 'error'
    })
  } finally {
    launchingStudio.value = false
  }
}

function closePublishModal() {
  if (!publishing.value) publishModalOpen.value = false
}

async function publishApprovedVersion() {
  const candidate = publishCandidate.value
  if (!candidate || publishing.value) return
  publishing.value = true
  try {
    await Promise.all([refreshLaunch(), refreshDomains(), refreshReleases()])
    const state = launchData.value
    if (failed.value || releasesError.value || reviewsError.value || !state || state.approvedVersionId !== candidate.versionId || state.checkpointId !== candidate.checkpointId || state.digest !== candidate.digest
      || state.plan.status !== 'ready' || productionDomain.value?.hostname !== candidate.hostname || (activeRelease.value?.id ?? null) !== candidate.releaseId) {
      publishModalOpen.value = false
      toast.add({ title: 'Website changed', description: 'Review the refreshed saved version, domain and release before publishing.', color: 'warning' })
      return
    }
    await $fetch(`/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/versions/${encodeURIComponent(candidate.versionId)}/publish`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: {
        environment: 'production',
        hostname: candidate.hostname,
        expectedActiveReleaseId: candidate.releaseId
      }
    })
    publishModalOpen.value = false
    await refreshAll()
    toast.add({ title: 'Published', description: `${candidate.hostname} now points to the approved release.`, color: 'success' })
  } catch (error: unknown) {
    const failure = error as { data?: { statusMessage?: string, message?: string } }
    toast.add({
      title: 'Publish did not complete',
      description: failure.data?.statusMessage || failure.data?.message || 'Inspect the Page Studio build and release audit before retrying.',
      color: 'error'
    })
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <section class="mx-auto w-full max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div class="space-y-2">
        <UButton
          to="/agency/page-studio"
          label="All websites"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="link"
          class="-ml-2"
        />
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
            {{ (!failed && launchData?.siteName) || site?.name || 'Website management' }}
          </h1>
          <p class="mt-1 max-w-3xl text-sm text-muted">
            Govern pages, approvals, releases and domains. Launch Studio when you need to edit the visual site.
          </p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          label="Refresh"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          :loading="loading"
          @click="refreshAll"
        />
        <UButton
          label="Launch Studio"
          icon="i-lucide-external-link"
          trailing
          :loading="launchingStudio"
          :disabled="!editorOrigin"
          @click="openStudio"
        />
      </div>
    </div>

    <UAlert
      v-if="failed"
      title="Site state could not be loaded"
      description="Refresh the page. If the problem continues, inspect Page Studio audit and runtime health."
      color="error"
      icon="i-lucide-circle-alert"
    />

    <div class="grid grid-cols-1 overflow-hidden rounded-xl border border-default bg-default md:grid-cols-4">
      <div class="border-b border-default p-4 md:border-b-0 md:border-r">
        <p class="text-sm text-muted">
          Site status
        </p>
        <div class="mt-2 flex items-center gap-2">
          <span class="size-2 rounded-full bg-emerald-500" /><span class="font-medium text-highlighted">{{ (!failed && launchData?.siteStatus) || site?.status || 'Loading' }}</span>
        </div>
      </div>
      <div class="border-b border-default p-4 md:border-b-0 md:border-r">
        <p class="text-sm text-muted">
          Active release
        </p>
        <p class="mt-2 truncate font-medium text-highlighted">
          {{ activeRelease?.id || 'No release' }}
        </p>
      </div>
      <div class="border-b border-default p-4 md:border-b-0 md:border-r">
        <p class="text-sm text-muted">
          Approved versions
        </p>
        <p class="mt-2 text-xl font-semibold text-highlighted">
          {{ reviewsError ? 'Unavailable' : approvedCount }}
        </p>
      </div>
      <div class="p-4">
        <p class="text-sm text-muted">
          Ready production domains
        </p><p class="mt-2 text-xl font-semibold text-highlighted">
          {{ domains.filter(domainReady).length }}
        </p>
      </div>
    </div>

    <PageStudioStagingWorkspace :key="siteId" :site-id="siteId" audience="agency" />

    <UTabs v-model="selectedTab" :items="tabs" class="w-full">
      <template #overview>
        <div class="grid grid-cols-1 gap-4 pt-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Release position
              </h2><p class="mt-1 text-sm text-muted">
                The selected production artifact and its governance state.
              </p>
            </template>
            <dl class="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <dt class="text-sm text-muted">
                  Release
                </dt><dd class="mt-1 break-all font-medium text-highlighted">
                  {{ activeRelease?.id || 'Not published' }}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-muted">
                  Activated
                </dt><dd class="mt-1 font-medium text-highlighted">
                  {{ formatDate(activeRelease?.activatedAt) }}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-muted">
                  Site route
                </dt><dd class="mt-1 font-medium text-highlighted">
                  {{ site?.route || '/' }}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-muted">
                  Starter
                </dt><dd class="mt-1 font-medium text-highlighted">
                  {{ site?.starterVersion || 'Custom' }}
                </dd>
              </div>
            </dl>
          </UCard>
          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Next action
              </h2>
            </template>
            <p class="text-sm leading-6 text-muted">
              Open Studio to edit the site. A saved checkpoint enters review before an approved version can be published here.
            </p>
            <template #footer>
              <UButton
                label="Open in Studio"
                icon="i-lucide-panel-top-open"
                block
                :loading="launchingStudio"
                :disabled="!editorOrigin"
                @click="openStudio"
              />
            </template>
          </UCard>
          <PageStudioLaunchReadiness
            class="min-w-0 lg:col-span-2"
            :items="readinessItems"
            :loading="loading"
            @navigate="navigateReadiness"
          />
          <div class="min-w-0 lg:col-span-2">
            <PageStudioAgencySetup :key="siteId" :site-id="siteId" />
          </div>
        </div>
      </template>

      <template #pages>
        <PageStudioPagesWorkspace :site-id="siteId" />
      </template>
      <template #history>
        <PageStudioDraftHistory
          :key="siteId"
          audience="agency"
          :site-id="siteId"
          @changed="refreshLaunch(); refreshReviews()"
        />
      </template>
      <template #assets>
        <PageStudioAssetsWorkspace :site-id="siteId" />
      </template>
      <template #forms>
        <PageStudioFormSubmissionsWorkspace :site-id="siteId" />
      </template>
      <template #analytics>
        <PageStudioAnalyticsWorkspace :site-id="siteId" />
      </template>
      <template #builds>
        <UCard class="mt-5">
          <template #header>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="font-semibold text-highlighted">
                  Governed publishing
                </h2>
                <p class="mt-1 max-w-2xl text-sm text-muted">
                  The server loads the approved immutable checkpoint, builds it, verifies the artifact and activates the release.
                </p>
              </div>
              <UButton
                label="Publish approved version"
                icon="i-lucide-rocket"
                :disabled="!canPublish"
                @click="openPublishModal"
              />
            </div>
          </template>
          <UAlert
            v-if="!approvedReview?.versionId"
            title="Approval required"
            description="Approve the current saved Studio version before publishing. Historical approvals do not cover later edits."
            color="warning"
            variant="subtle"
            icon="i-lucide-badge-alert"
          />
          <UAlert
            v-else-if="!productionDomain?.hostname"
            title="Production domain required"
            description="Verify the production hostname, DNS and HTTPS certificate before publishing this version."
            color="warning"
            variant="subtle"
            icon="i-lucide-globe-lock"
          />
          <dl v-else class="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <dt class="text-sm text-muted">
                Approved version
              </dt><dd class="mt-1 break-all font-medium text-highlighted">
                {{ approvedReview.versionId }}
              </dd>
            </div>
            <div>
              <dt class="text-sm text-muted">
                Production hostname
              </dt><dd class="mt-1 font-medium text-highlighted">
                {{ productionDomain.hostname }}
              </dd>
            </div>
          </dl>
        </UCard>
      </template>

      <template #releases>
        <UCard class="mt-5">
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Release history
            </h2>
          </template>
          <p v-if="releasesError" class="text-sm text-muted">
            Release history is unavailable with your current access.
          </p>
          <div v-else-if="releases.length" class="divide-y divide-default">
            <div v-for="release in releases" :key="release.id" class="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <p class="truncate font-medium text-highlighted">
                  {{ release.id }}
                </p><p class="mt-1 text-sm text-muted">
                  {{ formatDate(release.createdAt) }}
                </p>
              </div>
              <UBadge :label="release.status" :color="release.status === 'active' ? 'success' : 'neutral'" variant="subtle" />
            </div>
          </div>
          <p v-else class="text-sm text-muted">
            No releases have been recorded for this site.
          </p>
        </UCard>
      </template>

      <template #domains>
        <PageStudioDomainsWorkspace :site-id="siteId" />
      </template>

      <template #settings>
        <div class="space-y-4 pt-5">
          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Website access
              </h2>
            </template><p class="text-sm text-muted">
              {{ !failed && launchData?.plan.status === 'ready' ? `Current ${launchData.plan.key || 'website'} access is active.` : 'Website access is unavailable or needs review.' }}
            </p>
          </UCard>
          <PageStudioSessionsWorkspace :site-id="siteId" />
          <PageStudioEmailWorkspace :key="siteId" audience="agency" :site-id="siteId" />
        </div>
      </template>
    </UTabs>

    <UModal v-model:open="publishModalOpen" title="Publish approved version" description="This creates an immutable build and moves the production release pointer after verification.">
      <template #content>
        <div class="space-y-5 p-6">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              Publish approved version
            </h2>
            <p class="mt-1 text-sm leading-6 text-muted">
              XeroFlow will build the approved checkpoint and synchronise its navigation, footer, theme and SEO state with the release.
            </p>
          </div>
          <dl class="rounded-lg border border-default bg-elevated p-4 text-sm">
            <div class="flex items-start justify-between gap-4">
              <dt class="text-muted">
                Version
              </dt><dd class="break-all text-right font-medium text-highlighted">
                {{ publishCandidate?.versionId }}
              </dd>
            </div>
            <div class="mt-3 flex items-start justify-between gap-4">
              <dt class="text-muted">
                Hostname
              </dt><dd class="text-right font-medium text-highlighted">
                {{ publishCandidate?.hostname }}
              </dd>
            </div>
            <div class="mt-3 flex items-start justify-between gap-4">
              <dt class="text-muted">
                Current release
              </dt><dd class="break-all text-right font-medium text-highlighted">
                {{ publishCandidate?.releaseId || 'None' }}
              </dd>
            </div>
          </dl>
          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <UButton
              label="Cancel"
              color="neutral"
              variant="outline"
              :disabled="publishing"
              @click="closePublishModal"
            />
            <UButton
              label="Build and publish"
              icon="i-lucide-rocket"
              :loading="publishing"
              :disabled="!canPublish"
              @click="publishApprovedVersion"
            />
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
