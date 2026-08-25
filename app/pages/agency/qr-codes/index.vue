<script setup lang="ts">
import type { QrCode } from '~/composables/useQrCodes'

definePageMeta({ layout: 'agency' })
useHead({ title: 'QR Codes' })

const ALL = 'all' // USelectMenu sentinel — never an empty string
const { data: clientsData } = await useFetch<any[]>('/api/agency/clients')
const clientItems = computed(() => [
  { label: 'All clients', value: ALL, icon: 'i-lucide-layers' },
  ...(clientsData.value ?? []).map(c => ({ label: c.name, value: c.id }))
])

const route = useRoute()
const router = useRouter()
const clientModel = ref<string>((route.query.clientId as string) || ALL)
const clientId = computed(() => (clientModel.value === ALL ? undefined : clientModel.value))
watch(clientModel, (v) => {
  folderId.value = null
  const query = { ...route.query }
  if (v === ALL) delete query.clientId
  else query.clientId = v
  router.replace({ query })
})

const folderId = ref<string | null>(null)
const searchInput = ref('')
const search = refDebounced(searchInput, 250)
const grid = ref<{ refresh: () => void, openNew: () => void }>()

const loaded = ref<QrCode[]>([])
const totals = computed(() => ({
  codes: loaded.value.length,
  scans: loaded.value.reduce((n, c) => n + (c.scan_count ?? 0), 0),
  inactive: loaded.value.filter(c => !c.is_active).length
}))
// Rail count should reflect the client, not the current folder/search filter.
const railTotal = ref<number | undefined>(undefined)
function onLoaded(codes: QrCode[]) {
  loaded.value = codes
  if (!folderId.value && !search.value) railTotal.value = codes.length
}
</script>

<template>
  <div class="h-full overflow-y-auto p-6 space-y-6">
    <header class="flex flex-wrap items-start gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight">
          QR Codes
        </h1>
        <p class="mt-0.5 text-sm text-muted">
          Print once, redirect any time. Every scan is tracked.
        </p>
        <p v-if="loaded.length" class="mt-2 text-xs text-muted tabular-nums">
          {{ totals.codes }} {{ totals.codes === 1 ? 'code' : 'codes' }} · {{ totals.scans.toLocaleString() }} scans<template v-if="totals.inactive">
            · {{ totals.inactive }} inactive
          </template>
        </p>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <USelectMenu
          v-model="clientModel"
          :items="clientItems"
          value-key="value"
          :search-input="{ placeholder: 'Find a client…' }"
          class="w-56"
        />
        <UInput
          v-model="searchInput"
          icon="i-lucide-search"
          placeholder="Search name or URL"
          class="w-56"
        >
          <template v-if="searchInput" #trailing>
            <UButton
              icon="i-lucide-x"
              size="xs"
              variant="link"
              color="neutral"
              aria-label="Clear search"
              @click="() => { searchInput = '' }"
            />
          </template>
        </UInput>
        <UButton icon="i-lucide-plus" @click="grid?.openNew()">
          New QR code
        </UButton>
      </div>
    </header>

    <div class="grid grid-cols-1 gap-6" :class="clientId ? 'lg:grid-cols-[220px_minmax(0,1fr)]' : ''">
      <QrFolderRail
        v-if="clientId"
        v-model:folder-id="folderId"
        :client-id="clientId"
        :total-count="railTotal"
      />
      <QrGrid
        ref="grid"
        :client-id="clientId"
        :folder-id="folderId"
        :search="search"
        :show-client="!clientId"
        @loaded="onLoaded"
      />
    </div>
  </div>
</template>
