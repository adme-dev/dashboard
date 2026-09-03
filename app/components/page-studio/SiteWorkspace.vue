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
      eyebrow: 'Reference environment',
      title: 'Page Studio demo sites',
      description: 'Open maintained, non-customer websites for demonstrations, release rehearsals and safe battle testing.',
      emptyTitle: 'No demo sites yet',
      emptyDescription: 'Governed reference sites will appear here after their synthetic client entitlement is provisioned.'
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
      title: 'Governed demo environment',
      description: 'Demo sites exercise the same page, component, AI, review and release controls as customer websites without using customer data or infrastructure.'
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
    launchingSiteId.value = null
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

      <div class="flex items-center gap-3">
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
            <UBadge :color="statusColor(site.status)" variant="subtle">
              {{ statusLabel(site.status) }}
            </UBadge>
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

          <div class="mt-auto flex items-center justify-between gap-3 border-t border-default pt-4">
            <div class="flex min-w-0 items-center gap-2 text-xs text-muted">
              <UIcon name="i-lucide-shield-check" class="size-4 shrink-0 text-primary" />
              <span class="truncate">{{ audience === 'agency' ? 'Agency-managed release' : 'Managed by your agency' }}</span>
            </div>
            <div class="flex shrink-0 items-center gap-2">
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
</template>
