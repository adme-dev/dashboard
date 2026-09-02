<script setup lang="ts">
interface SiteSummary {
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
  id: string
  siteId?: string
  hostname: string
  environment: string
  status: string
}

interface SubscriptionSummary {
  id: string
  siteId?: string
}

type CollectionResponse<T> = {
  items?: T[]
  sites?: T[]
  releases?: T[]
  reviews?: T[]
  domains?: T[]
  subscriptions?: T[]
}

const props = defineProps<{ siteId: string }>()
const toast = useToast()
const publishModalOpen = ref(false)
const publishing = ref(false)

const { data: sitesData, status: sitesStatus, error: sitesError, refresh: refreshSites } = await useFetch<CollectionResponse<SiteSummary>>('/api/agency/page-studio/sites')
const { data: releasesData, status: releasesStatus, error: releasesError, refresh: refreshReleases } = await useFetch<CollectionResponse<ReleaseSummary>>('/api/agency/page-studio/releases')
const { data: reviewsData, status: reviewsStatus, error: reviewsError, refresh: refreshReviews } = await useFetch<CollectionResponse<ReviewSummary>>('/api/agency/page-studio/reviews')
const { data: domainsData, status: domainsStatus, error: domainsError, refresh: refreshDomains } = await useFetch<CollectionResponse<DomainSummary>>('/api/agency/page-studio/domains')
const { data: subscriptionsData, status: subscriptionsStatus, error: subscriptionsError, refresh: refreshSubscriptions } = await useFetch<CollectionResponse<SubscriptionSummary>>('/api/agency/page-studio/subscriptions')

function rows<T>(value: CollectionResponse<T> | null | undefined, key: keyof CollectionResponse<T>): T[] {
  const keyed = value?.[key] as T[] | undefined
  return Array.isArray(keyed) ? keyed : (value?.items || [])
}

const site = computed(() => rows<SiteSummary>(sitesData.value, 'sites').find(item => item.id === props.siteId))
const releases = computed(() => rows<ReleaseSummary>(releasesData.value, 'releases').filter(item => !item.siteId || item.siteId === props.siteId))
const reviews = computed(() => rows<ReviewSummary>(reviewsData.value, 'reviews').filter(item => !item.siteId || item.siteId === props.siteId))
const domains = computed(() => rows<DomainSummary>(domainsData.value, 'domains').filter(item => !item.siteId || item.siteId === props.siteId))
const subscriptions = computed(() => rows<SubscriptionSummary>(subscriptionsData.value, 'subscriptions').filter(item => !item.siteId || item.siteId === props.siteId))
const activeRelease = computed(() => releases.value.find(release => release.status === 'active') || releases.value[0])
const approvedCount = computed(() => reviews.value.filter(review => review.decision === 'approved').length)
const approvedReview = computed(() => reviews.value.find(review => review.decision === 'approved' && review.versionId))
const productionDomain = computed(() => domains.value.find(domain => domain.environment === 'production' && domain.status === 'active') || domains.value.find(domain => domain.environment === 'production'))
const canPublish = computed(() => Boolean(approvedReview.value?.versionId && productionDomain.value?.hostname))
const loading = computed(() => [sitesStatus, releasesStatus, reviewsStatus, domainsStatus, subscriptionsStatus].some(state => state.value === 'pending'))
const failed = computed(() => Boolean(sitesError.value || releasesError.value || reviewsError.value || domainsError.value || subscriptionsError.value))

const tabs = [
  { label: 'Overview', slot: 'overview' as const },
  { label: 'Pages', slot: 'pages' as const },
  { label: 'Builds', slot: 'builds' as const },
  { label: 'Releases', slot: 'releases' as const },
  { label: 'Domains', slot: 'domains' as const },
  { label: 'Settings', slot: 'settings' as const }
]

function formatDate(value?: string | null) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

async function refreshAll() {
  await Promise.all([refreshSites(), refreshReleases(), refreshReviews(), refreshDomains(), refreshSubscriptions()])
  toast.add({ title: 'Site refreshed', description: 'The latest control-plane state is now shown.', color: 'success' })
}

function openPublishModal() {
  publishModalOpen.value = true
}

function closePublishModal() {
  if (!publishing.value) publishModalOpen.value = false
}

async function publishApprovedVersion() {
  const review = approvedReview.value
  const domain = productionDomain.value
  if (!review?.versionId || !domain?.hostname || publishing.value) return

  publishing.value = true
  try {
    await $fetch(`/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/versions/${encodeURIComponent(review.versionId)}/publish`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: {
        environment: 'production',
        hostname: domain.hostname,
        expectedActiveReleaseId: activeRelease.value?.id || null
      }
    })
    publishModalOpen.value = false
    await refreshAll()
    toast.add({ title: 'Published', description: `${domain.hostname} now points to the approved release.`, color: 'success' })
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
  <section class="space-y-6">
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
            {{ site?.name || 'Website management' }}
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
          :to="`/agency/page-studio/${siteId}/edit`"
          label="Launch Studio"
          icon="i-lucide-external-link"
          trailing
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
          <span class="size-2 rounded-full bg-emerald-500" /><span class="font-medium text-highlighted">{{ site?.status || 'Loading' }}</span>
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
          {{ approvedCount }}
        </p>
      </div>
      <div class="p-4">
        <p class="text-sm text-muted">
          Connected domains
        </p><p class="mt-2 text-xl font-semibold text-highlighted">
          {{ domains.length }}
        </p>
      </div>
    </div>

    <UTabs :items="tabs" class="w-full">
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
                  {{ formatDate(activeRelease?.createdAt) }}
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
                :to="`/agency/page-studio/${siteId}/edit`"
                label="Open in Studio"
                icon="i-lucide-panel-top-open"
                block
              />
            </template>
          </UCard>
        </div>
      </template>

      <template #pages>
        <PageStudioPagesWorkspace :site-id="siteId" />
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
            description="Approve a saved Studio version before publishing."
            color="warning"
            variant="subtle"
            icon="i-lucide-badge-alert"
          />
          <UAlert
            v-else-if="!productionDomain?.hostname"
            title="Production domain required"
            description="Connect a production hostname before publishing this version."
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
          <div v-if="releases.length" class="divide-y divide-default">
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
        <UCard class="mt-5">
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Domains and DNS
            </h2>
          </template>
          <div v-if="domains.length" class="divide-y divide-default">
            <div v-for="domain in domains" :key="domain.id" class="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="font-medium text-highlighted">
                  {{ domain.hostname }}
                </p><p class="mt-1 text-sm text-muted">
                  {{ domain.environment }}
                </p>
              </div>
              <UBadge :label="domain.status" :color="domain.status === 'active' ? 'success' : 'warning'" variant="subtle" />
            </div>
          </div>
          <p v-else class="text-sm text-muted">
            No domains are connected to this site.
          </p>
        </UCard>
      </template>

      <template #settings>
        <UCard class="mt-5">
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Subscriptions
            </h2>
          </template><p class="text-sm text-muted">
            {{ subscriptions.length }} active or historical subscription record{{ subscriptions.length === 1 ? '' : 's' }} are attached to this site.
          </p>
        </UCard>
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
                {{ approvedReview?.versionId }}
              </dd>
            </div>
            <div class="mt-3 flex items-start justify-between gap-4">
              <dt class="text-muted">
                Hostname
              </dt><dd class="text-right font-medium text-highlighted">
                {{ productionDomain?.hostname }}
              </dd>
            </div>
            <div class="mt-3 flex items-start justify-between gap-4">
              <dt class="text-muted">
                Current release
              </dt><dd class="break-all text-right font-medium text-highlighted">
                {{ activeRelease?.id || 'None' }}
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
