<script setup lang="ts">
type Section = 'reviews' | 'releases' | 'domains' | 'subscriptions'
type Audience = 'agency' | 'portal'

const props = defineProps<{ section: Section, audience: Audience }>()

const configuration = {
  reviews: { title: 'Page Studio reviews', description: 'Versions waiting for an agency decision and their latest review outcome.', icon: 'i-lucide-badge-check', empty: 'No Page Studio versions are waiting for review.' },
  releases: { title: 'Page Studio releases', description: 'Immutable builds and the release pointers currently selected for each hostname.', icon: 'i-lucide-rocket', empty: 'No Page Studio releases have been recorded.' },
  domains: { title: 'Domains & DNS', description: 'Ownership, DNS, certificate and hostname lifecycle state for Page Studio sites.', icon: 'i-lucide-globe-2', empty: 'No custom domains have been connected.' },
  subscriptions: { title: 'Page Studio subscriptions', description: 'Client entitlements and current site and custom-domain consumption.', icon: 'i-lucide-gauge', empty: 'No Page Studio entitlements have been provisioned.' }
} as const

const config = computed(() => configuration[props.section])
const endpoint = computed(() => `/api/${props.audience}/page-studio/${props.section}`)
const { data, pending, error, refresh } = await useFetch<Record<string, Array<Record<string, unknown>>>>(endpoint)
const records = computed(() => data.value?.[props.section] ?? [])

function formatDate(value: unknown) {
  if (typeof value !== 'string' || !value) return '-'
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function titleCase(value: unknown) {
  if (typeof value !== 'string' || !value) return '-'
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

const columns = computed(() => {
  if (props.section === 'reviews') return [
    { accessorKey: 'client', header: 'Client' }, { accessorKey: 'site', header: 'Site' },
    { accessorKey: 'summary', header: 'Version' }, { accessorKey: 'status', header: 'Status' },
    { accessorKey: 'decision', header: 'Latest decision' }, { accessorKey: 'activity', header: 'Activity' }
  ]
  if (props.section === 'releases') return [
    { accessorKey: 'site', header: 'Site' }, { accessorKey: 'environment', header: 'Environment' },
    { accessorKey: 'hostname', header: 'Hostname' }, { accessorKey: 'build', header: 'Build' },
    { accessorKey: 'active', header: 'Pointer' }, { accessorKey: 'activity', header: 'Published' }
  ]
  if (props.section === 'domains') return [
    { accessorKey: 'site', header: 'Site' }, { accessorKey: 'hostname', header: 'Hostname' },
    { accessorKey: 'dns', header: 'DNS' }, { accessorKey: 'tls', header: 'TLS' },
    { accessorKey: 'lifecycle', header: 'Lifecycle' }, { accessorKey: 'activity', header: 'Updated' }
  ]
  return [
    { accessorKey: 'client', header: 'Client' }, { accessorKey: 'plan', header: 'Plan' },
    { accessorKey: 'status', header: 'Status' }, { accessorKey: 'sites', header: 'Sites' },
    { accessorKey: 'domains', header: 'Domains' }, { accessorKey: 'builds', header: 'Monthly builds' }
  ]
})

const rows = computed(() => records.value.map((record) => {
  if (props.section === 'reviews') return {
    client: record.clientName ?? 'Current client', site: record.siteName, summary: record.summary,
    status: titleCase(record.status), decision: titleCase(record.decision),
    activity: formatDate(record.decidedAt ?? record.submittedAt)
  }
  if (props.section === 'releases') return {
    site: [record.clientName, record.siteName].filter(Boolean).join(' / '),
    environment: titleCase(record.environment), hostname: record.hostname,
    build: `${record.buildId} / ${titleCase(record.buildState)}`,
    active: record.active ? 'Active' : 'Superseded', activity: formatDate(record.publishedAt)
  }
  if (props.section === 'domains') return {
    site: [record.clientName, record.siteName].filter(Boolean).join(' / '), hostname: record.hostname,
    dns: titleCase(record.dnsStatus), tls: titleCase(record.tlsStatus),
    lifecycle: titleCase(record.lifecycleState), activity: formatDate(record.updatedAt)
  }
  return {
    client: record.clientName, plan: titleCase(record.planKey), status: titleCase(record.status),
    sites: `${record.siteCount} / ${record.siteLimit}`,
    domains: `${record.domainCount} / ${record.domainLimit}`, builds: record.buildLimit
  }
}))
</script>

<template>
  <UDashboardPanel :id="`page-studio-${section}`">
    <template #header>
      <UDashboardNavbar :title="config.title" :description="config.description">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            label="Refresh"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :loading="pending"
            @click="refresh"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-5">
        <UAlert
          v-if="section === 'domains'"
          color="warning"
          variant="subtle"
          icon="i-lucide-hard-hat"
          title="Public hostname activation is gated"
          description="DNS state is real. A hostname remains pending until DNS, TLS, build verification and atomic release activation have all passed."
        />
        <div v-if="pending" class="space-y-3" aria-busy="true">
          <USkeleton class="h-16" /><USkeleton class="h-56" />
        </div>
        <UAlert
          v-else-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Unable to load Page Studio data"
          description="The control-plane request failed. Refresh or check the selected organisation and your Page Studio permissions."
        />
        <UCard v-else-if="rows.length" :ui="{ body: '!p-0' }">
          <template #header>
            <div class="flex items-center gap-3">
              <div class="flex size-9 items-center justify-center rounded-lg bg-elevated">
                <UIcon :name="config.icon" class="size-4 text-primary" />
              </div>
              <div>
                <p class="font-medium">
                  {{ rows.length }} record{{ rows.length === 1 ? '' : 's' }}
                </p><p class="text-xs text-muted">
                  Current control-plane state
                </p>
              </div>
            </div>
          </template>
          <UTable :columns="columns" :data="rows" class="w-full" />
        </UCard>
        <UCard v-else>
          <div class="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
            <div class="flex size-11 items-center justify-center rounded-xl bg-elevated">
              <UIcon :name="config.icon" class="size-5 text-muted" />
            </div>
            <div>
              <h2 class="font-semibold">
                Nothing to show yet
              </h2><p class="mt-1 max-w-md text-sm text-muted">
                {{ config.empty }}
              </p>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
