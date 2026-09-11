<script setup lang="ts">
import type { PageStudioSiteSummary } from '~/types'

const props = defineProps<{
  audience: 'agency' | 'portal'
  sites: PageStudioSiteSummary[]
  total: number
  page: number
  pageSize: number
  pending?: boolean
  errorMessage?: string | null
}>()

const emit = defineEmits<{
  'refresh': []
  'update:page': [page: number]
}>()

const config = useRuntimeConfig()
const toast = useToast()
const launchingSiteId = ref<string | null>(null)
const createOpen = ref(false)
const creating = ref(false)
const reviewing = ref(false)
const createError = ref<string | null>(null)
const proposal = ref<{ modules: string[], pages: string[], collections: string[], missingFacts: string[], questions?: string[], requiresAgencyReview: boolean } | null>(null)
const createForm = reactive({ name: '', route: '', starterVersion: 'limousine-v1', setupSource: 'template', setupBrief: '' })
const starterOptions = [
  { label: 'Limousine and tours', value: 'limousine-v1' },
  { label: 'Floristry', value: 'floristry-v1' },
  { label: 'Retail', value: 'retail-v1' },
  { label: 'IT goods', value: 'it-goods-v1' },
  { label: 'Import and export', value: 'import-export-v1' }
]
const setupSourceOptions = [
  { label: 'Start from this template', value: 'template' },
  { label: 'Describe what you need', value: 'chat' }
]
const { launchPageStudio } = usePageStudioLauncher()
const editorUrl = computed(() => {
  const value = config.public.pageStudioEditorUrl
  if (typeof value !== 'string' || !value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
})

const pageModel = computed({
  get: () => props.page,
  set: value => emit('update:page', value)
})

const audienceCopy = computed(() => props.audience === 'agency'
  ? {
      eyebrow: 'Website Builder',
      title: 'Client websites',
      description: 'Create client website drafts, open Studio and follow each website through setup, review and publishing.',
      emptyTitle: 'No websites yet',
      emptyDescription: 'Create a website for a client with an active subscription and available site allowance.'
    }
  : {
      eyebrow: 'Client workspace',
      title: 'Your websites',
      description: 'Review the websites assigned to your portal account and follow their release status.',
      emptyTitle: 'No websites assigned',
      emptyDescription: 'Contact your agency team if a website should be available in this portal.'
    })

const rolloutCopy = computed(() => props.audience === 'agency'
  ? {
      title: 'Website setup and publishing',
      description: 'Draft workspaces, reference sites and live client websites share this portfolio. A saved draft still needs content setup and a reviewed release before publication.'
    }
  : {
      title: 'Managed website workspace',
      description: 'Website editing, previews, publishing and domains remain subject to your agency release controls.'
    })

function formattedDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date)
}

function formattedRoute(route: string) {
  if (!route) return 'Homepage'
  return route.startsWith('/') ? route : `/${route}`
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function statusColor(status: string): 'success' | 'warning' | 'info' | 'neutral' {
  if (['active', 'published', 'live'].includes(status)) return 'success'
  if (['building', 'deploying', 'review'].includes(status)) return 'info'
  if (['paused', 'blocked'].includes(status)) return 'warning'
  return 'neutral'
}

async function launchStudio(site: PageStudioSiteSummary) {
  if (!editorUrl.value || launchingSiteId.value) return
  launchingSiteId.value = site.id
  try {
    await launchPageStudio(site.id, props.audience)
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'data' in error
      && error.data && typeof error.data === 'object' && 'message' in error.data
      ? String(error.data.message)
      : 'The governed editor session could not be started.'
    toast.add({
      title: 'Page Studio could not open',
      description: message,
      color: 'error'
    })
  } finally {
    launchingSiteId.value = null
  }
}

async function createSite() {
  if (props.audience !== 'portal' || creating.value) return
  createError.value = null
  if (!createForm.name.trim() || !/^[a-z0-9](?:[a-z0-9-]{0,62})$/.test(createForm.route)) {
    createError.value = 'Enter a site name and a lowercase route using letters, numbers and hyphens.'
    return
  }
  creating.value = true
  try {
    await $fetch('/api/portal/page-studio/sites', {
      method: 'POST',
      body: {
        name: createForm.name.trim(),
        route: createForm.route,
        starterVersion: createForm.starterVersion,
        setupSource: createForm.setupSource,
        ...(createForm.setupBrief.trim() ? { setupBrief: createForm.setupBrief.trim() } : {})
      }
    })
    createOpen.value = false
    createForm.name = ''
    createForm.route = ''
    createForm.setupBrief = ''
    toast.add({ title: 'Website created', description: 'Your new website is ready for content setup.', color: 'success' })
    emit('refresh')
  } catch (error: unknown) {
    createError.value = error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object' && 'statusMessage' in error.data
      ? String(error.data.statusMessage)
      : 'The website could not be created. Check your plan allowance and try again.'
  } finally {
    creating.value = false
  }
}

async function reviewSetup() {
  createError.value = null
  if (!createForm.name.trim() || !/^[a-z0-9](?:[a-z0-9-]{0,62})$/.test(createForm.route)) {
    createError.value = 'Enter a site name and a lowercase route using letters, numbers and hyphens.'
    return
  }
  reviewing.value = true
  try {
    const result = await $fetch<{ proposal: typeof proposal.value }>('/api/portal/page-studio/setup-proposal', {
      method: 'POST',
      body: {
        name: createForm.name.trim(),
        route: createForm.route,
        starterVersion: createForm.starterVersion,
        setupSource: createForm.setupSource,
        ...(createForm.setupBrief.trim() ? { setupBrief: createForm.setupBrief.trim() } : {})
      }
    })
    proposal.value = result.proposal
  } catch (error: unknown) {
    createError.value = error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object' && 'statusMessage' in error.data
      ? String(error.data.statusMessage)
      : 'The setup proposal could not be generated.'
  } finally {
    reviewing.value = false
  }
}
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="max-w-3xl">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {{ audienceCopy.eyebrow }}
        </p>
        <h1 class="mt-2 text-2xl font-semibold text-highlighted sm:text-3xl">
          {{ audienceCopy.title }}
        </h1>
        <p class="mt-2 text-sm leading-6 text-muted sm:text-base">
          {{ audienceCopy.description }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <PageStudioAgencySiteCreate v-if="audience === 'agency'" @created="emit('update:page', 1); emit('refresh')" />
        <UBadge color="neutral" variant="subtle" size="lg">
          {{ total }} {{ total === 1 ? 'site' : 'sites' }}
        </UBadge>
        <UButton
          label="Refresh"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          :loading="pending"
          @click="emit('refresh')"
        />
        <UButton
          v-if="audience === 'portal'"
          label="New website"
          icon="i-lucide-plus"
          color="primary"
          @click="proposal = null; createOpen = true"
        />
      </div>
    </div>

    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-rocket"
      :title="rolloutCopy.title"
      :description="rolloutCopy.description"
    />

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Page Studio could not be loaded"
      :description="errorMessage"
    >
      <template #actions>
        <UButton
          label="Try again"
          color="error"
          variant="soft"
          @click="emit('refresh')"
        />
      </template>
    </UAlert>

    <div v-else-if="pending && sites.length === 0" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <UCard v-for="index in 6" :key="index">
        <div class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <USkeleton class="h-5 w-2/3" />
            <USkeleton class="h-5 w-16 rounded-full" />
          </div>
          <USkeleton class="h-4 w-1/2" />
          <USkeleton class="h-16 w-full" />
        </div>
      </UCard>
    </div>

    <UCard v-else-if="sites.length === 0" class="text-center">
      <div class="mx-auto flex max-w-lg flex-col items-center py-10">
        <span class="flex size-12 items-center justify-center rounded-xl bg-elevated">
          <UIcon name="i-lucide-panels-top-left" class="size-6 text-muted" />
        </span>
        <h2 class="mt-4 text-lg font-semibold text-highlighted">
          {{ audienceCopy.emptyTitle }}
        </h2>
        <p class="mt-2 text-sm leading-6 text-muted">
          {{ audienceCopy.emptyDescription }}
        </p>
      </div>
    </UCard>

    <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <UCard v-for="site in sites" :key="site.id" class="h-full">
        <div class="flex h-full flex-col gap-5">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <h2 class="truncate text-base font-semibold text-highlighted">
                {{ site.name }}
              </h2>
              <p class="mt-1 truncate font-mono text-xs text-muted">
                {{ formattedRoute(site.route) }}
              </p>
            </div>
            <div class="flex flex-col items-end gap-1">
              <UBadge :color="statusColor(site.status)" variant="subtle">
                {{ statusLabel(site.status) }}
              </UBadge>
              <UBadge
                v-if="audience === 'portal' && site.setupProposalStatus"
                :color="site.setupProposalStatus === 'accepted' ? 'success' : site.setupProposalStatus === 'rejected' ? 'warning' : 'info'"
                variant="outline"
                size="xs"
              >
                Setup {{ statusLabel(site.setupProposalStatus) }}
              </UBadge>
            </div>
          </div>

          <dl class="grid grid-cols-2 gap-3 text-sm">
            <div class="rounded-lg bg-elevated/60 p-3">
              <dt class="text-xs text-muted">
                Starter
              </dt>
              <dd class="mt-1 truncate font-medium text-highlighted">
                {{ site.starterVersion }}
              </dd>
            </div>
            <div class="rounded-lg bg-elevated/60 p-3">
              <dt class="text-xs text-muted">
                Last updated
              </dt>
              <dd class="mt-1 font-medium text-highlighted">
                {{ formattedDate(site.updatedAt) }}
              </dd>
            </div>
          </dl>

          <div class="mt-auto flex flex-col gap-3 border-t border-default pt-4">
            <div class="flex min-w-0 items-center gap-2 text-xs text-muted">
              <UIcon name="i-lucide-shield-check" class="size-4 shrink-0 text-primary" />
              <span class="truncate">{{ audience === 'agency' ? 'Agency-managed release' : 'Managed by your agency' }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                v-if="audience === 'agency'"
                :to="`/agency/page-studio/${site.id}`"
                label="Manage site"
                icon="i-lucide-settings-2"
                color="neutral"
                variant="outline"
                size="sm"
              />
              <UButton
                v-if="audience === 'portal'"
                :to="`/portal/page-studio/${site.id}/content`"
                label="Manage content"
                color="neutral"
                variant="outline"
                size="sm"
              />
              <UButton
                v-if="site.bookingEnabled"
                :to="{ path: `/${audience}/page-studio/bookings`, query: { siteId: site.id } }"
                label="Bookings"
                icon="i-lucide-calendar-check"
                color="neutral"
                variant="outline"
                size="sm"
              />
              <UButton
                v-if="audience === 'portal'"
                :to="`/portal/page-studio/${site.id}/setup`"
                label="Setup status"
                icon="i-lucide-activity"
                color="neutral"
                variant="ghost"
                size="sm"
              />
              <UButton
                v-if="audience === 'portal'"
                :to="`/portal/page-studio/${site.id}/submissions`"
                label="Submissions"
                icon="i-lucide-inbox"
                color="neutral"
                variant="ghost"
                size="sm"
              />
              <UButton
                v-if="editorUrl"
                label="Launch Studio"
                icon="i-lucide-panels-top-left"
                color="primary"
                size="sm"
                :loading="launchingSiteId === site.id"
                :disabled="launchingSiteId !== null && launchingSiteId !== site.id"
                @click="launchStudio(site)"
              />
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <UPagination
      v-if="total > pageSize"
      v-model:page="pageModel"
      :total="total"
      :items-per-page="pageSize"
      class="justify-end"
    />
  </section>

  <UModal v-model:open="createOpen" :title="'Create a website'" :description="'Choose a starter and reserve a site route for your business.'">
    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="createError"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Website could not be created"
          :description="createError"
        />
        <UFormField label="Website name" required>
          <UInput v-model="createForm.name" class="w-full" placeholder="Northside Supply" />
        </UFormField>
        <UFormField label="Site route" help="Lowercase letters, numbers and hyphens only." required>
          <UInput v-model="createForm.route" class="w-full" placeholder="northside-supply" />
        </UFormField>
        <UFormField label="Starter template" required>
          <USelectMenu
            v-model="createForm.starterVersion"
            :items="starterOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Setup path" required>
          <USelectMenu
            v-model="createForm.setupSource"
            :items="setupSourceOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Setup brief" help="Describe the pages, services or workflows you want the agency to configure after creation.">
          <UTextarea
            v-model="createForm.setupBrief"
            class="w-full"
            :rows="4"
            maxlength="4000"
            placeholder="We offer wedding flowers, same-day delivery and online enquiries..."
          />
        </UFormField>
        <UCard v-if="proposal" variant="subtle">
          <div class="space-y-3 text-sm">
            <div class="flex items-center gap-2 font-medium text-highlighted">
              <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
              Proposed setup
            </div>
            <p class="text-muted">
              Pages: {{ proposal.pages.join(', ') }}
            </p>
            <p class="text-muted">
              Collections: {{ proposal.collections.join(', ') }}
            </p>
            <div v-if="proposal.missingFacts.length" class="rounded-lg border border-warning/30 bg-warning/5 p-3">
              <p class="font-medium text-highlighted">
                Details still needed
              </p>
              <ul class="mt-2 list-disc space-y-1 pl-5 text-muted">
                <li v-for="question in proposal.questions?.length ? proposal.questions : proposal.missingFacts" :key="question">
                  {{ question }}
                </li>
              </ul>
            </div>
            <p class="text-xs text-muted">
              An agency review is required before resources are provisioned or published. Missing details are never invented.
            </p>
          </div>
        </UCard>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="creating"
          @click="proposal = null; createOpen = false"
        />
        <UButton
          v-if="!proposal"
          label="Review setup"
          color="primary"
          :loading="reviewing"
          @click="reviewSetup"
        />
        <UButton
          v-else
          label="Create website"
          color="primary"
          :loading="creating"
          @click="createSite"
        />
      </div>
    </template>
  </UModal>
</template>
