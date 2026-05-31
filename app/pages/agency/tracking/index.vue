<script setup lang="ts">
definePageMeta({
  title: 'Site Tracking',
  layout: 'agency',
  middleware: ['role-media']
})

interface TrackingSiteRow {
  id: string
  client_id: string
  name: string
  write_key: string
  spa: boolean
  consent_mode: string
  is_active: boolean
  events_24h: number | string
  created_at: string
}

const { data, pending, refresh } = await useFetch<{ sites: TrackingSiteRow[] }>('/api/agency/tracking')
const sites = computed(() => data.value?.sites ?? [])

const showCreate = ref(false)
const showInstall = ref(false)
const installSiteId = ref<string | null>(null)

const toast = useToast()

function openInstall(id: string) {
  installSiteId.value = id
  showInstall.value = true
}

async function copyKey(key: string) {
  try {
    await navigator.clipboard.writeText(key)
    toast.add({ title: 'Write key copied', color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed', color: 'error' })
  }
}

function truncateKey(key: string) {
  return key.length > 16 ? key.slice(0, 12) + '…' + key.slice(-3) : key
}

const columns = [
  { accessorKey: 'name', header: 'Site' },
  { accessorKey: 'write_key', header: 'Write key' },
  { accessorKey: 'spa', header: 'Type' },
  { accessorKey: 'events_24h', header: 'Events (24h)' },
  { accessorKey: 'actions', header: '' }
]
</script>

<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">
          Site Tracking
        </h1>
        <p class="text-sm text-muted mt-1 max-w-2xl">
          First-party tracking tags for client websites. Provision a site, install the snippet, and
          behavioural events flow into the dashboard.
        </p>
      </div>
      <UButton
        color="primary"
        icon="i-lucide-plus"
        label="New tracking site"
        @click="showCreate = true"
      />
    </div>

    <!-- Empty state -->
    <div
      v-if="!pending && sites.length === 0"
      class="border border-dashed border-default rounded-xl py-16 px-6 text-center"
    >
      <UIcon name="i-lucide-radio" class="size-10 text-muted mx-auto" />
      <p class="mt-3 text-sm font-medium">
        No tracking sites yet
      </p>
      <p class="text-sm text-muted mt-1">
        Create one to generate a write key and install snippet.
      </p>
      <UButton
        class="mt-4"
        color="primary"
        variant="soft"
        icon="i-lucide-plus"
        label="New tracking site"
        @click="showCreate = true"
      />
    </div>

    <!-- Table -->
    <UTable
      v-else
      :columns="columns"
      :data="sites"
      :loading="pending"
      class="border border-default rounded-xl"
    >
      <template #name-cell="{ row }">
        <div class="flex flex-col">
          <span class="font-medium">{{ row.original.name }}</span>
          <span class="text-xs text-muted">{{ row.original.consent_mode }}</span>
        </div>
      </template>

      <template #write_key-cell="{ row }">
        <button
          type="button"
          class="font-mono text-xs text-muted hover:text-default inline-flex items-center gap-1"
          @click="copyKey(row.original.write_key)"
        >
          {{ truncateKey(row.original.write_key) }}
          <UIcon name="i-lucide-copy" class="size-3" />
        </button>
      </template>

      <template #spa-cell="{ row }">
        <UBadge :color="row.original.spa ? 'info' : 'neutral'" variant="soft" size="sm">
          {{ row.original.spa ? 'SPA' : 'MPA' }}
        </UBadge>
      </template>

      <template #events_24h-cell="{ row }">
        <span class="tabular-nums">{{ Number(row.original.events_24h) || 0 }}</span>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex justify-end">
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-lucide-code"
            label="Install"
            @click="openInstall(row.original.id)"
          />
        </div>
      </template>
    </UTable>

    <!-- Create slideover -->
    <TrackingSiteCreateSlideover v-model:open="showCreate" @created="refresh()" />

    <!-- Install modal -->
    <UModal v-model:open="showInstall" title="Install tracking">
      <template #body>
        <TrackingInstallSnippet v-if="installSiteId" :site-id="installSiteId" />
      </template>
    </UModal>
  </div>
</template>
