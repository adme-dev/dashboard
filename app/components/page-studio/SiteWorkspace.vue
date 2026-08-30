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

const pageModel = computed({
  get: () => props.page,
  set: value => emit('update:page', value)
})

const audienceCopy = computed(() => props.audience === 'agency'
  ? {
      eyebrow: 'Agency workspace',
      title: 'Websites under management',
      description: 'Track every client website provisioned through Page Studio from one governed workspace.',
      emptyTitle: 'No Page Studio sites yet',
      emptyDescription: 'Sites will appear here when a client subscription is provisioned.'
    }
  : {
      eyebrow: 'Client workspace',
      title: 'Your websites',
      description: 'Review the websites assigned to your portal account and follow their release status.',
      emptyTitle: 'No websites assigned',
      emptyDescription: 'Contact your agency team if a website should be available in this portal.'
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
      title="Staged Page Studio rollout"
      description="Website editing, previews, publishing and domains are being introduced behind release controls. This workspace currently shows the sites available to your account."
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

          <div class="mt-auto flex items-center gap-2 border-t border-default pt-4 text-xs text-muted">
            <UIcon name="i-lucide-shield-check" class="size-4 text-primary" />
            <span>{{ audience === 'agency' ? 'Agency-managed release' : 'Managed by your agency' }}</span>
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
