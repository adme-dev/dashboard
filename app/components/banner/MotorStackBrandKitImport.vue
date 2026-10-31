<script setup lang="ts">
import { apiErrorDescription } from '~/utils/apiError'
import { motorStackImportRows, runMotorStackImport } from '~/utils/banner-motorstack-import'
import type { MotorStackBrand, MotorStackImportResult, MotorStackImportRow } from '~/utils/banner-motorstack-import'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ complete: [] }>()
const rows = ref<MotorStackImportRow[]>([])
const catalogWarnings = ref<string[]>([])
const busy = ref(false)
const stopping = ref(false)
let disposed = false
const api = $fetch as <T>(url: string, options: Record<string, unknown>) => Promise<T>
const { data, error, status, execute } = useFetch<{ brands: MotorStackBrand[], warnings: string[] }>(
  '/api/agency/banner-studio/brand-kits/motorstack', { immediate: false }
)
const loading = computed(() => status.value === 'pending')
const loaded = ref(false)
const failed = computed(() => rows.value.filter(row => row.status === 'failed'))
const pending = computed(() => rows.value.filter(row => row.status === 'pending'))
const finished = computed(() => rows.value.filter(row => !['pending', 'importing'].includes(row.status)).length)
const current = computed(() => rows.value.find(row => row.status === 'importing'))
const totals = computed(() => ({
  imported: rows.value.filter(row => row.status === 'imported').length,
  existing: rows.value.filter(row => row.status === 'existing').length,
  skipped: rows.value.filter(row => row.status === 'skipped').length
}))
const statusLabels = {
  pending: 'Ready', importing: 'Importing', imported: 'Imported', existing: 'Already saved', skipped: 'Skipped', failed: 'Failed'
}
function statusColor(value: MotorStackImportRow['status']) {
  if (value === 'imported') return 'success' as const
  if (value === 'failed') return 'error' as const
  if (value === 'skipped') return 'warning' as const
  return 'neutral' as const
}
async function loadCatalog() {
  await execute()
  if (error.value || !data.value) return
  rows.value = motorStackImportRows(data.value.brands)
  catalogWarnings.value = data.value.warnings
  loaded.value = true
}
watch(open, (value) => {
  if (value && !loaded.value && !loading.value) loadCatalog()
}, { immediate: true })
onBeforeUnmount(() => {
  disposed = true
})

async function start(selection: MotorStackImportRow[]) {
  if (busy.value || !selection.length) return
  busy.value = true
  stopping.value = false
  try {
    await runMotorStackImport(selection, brandId => api<MotorStackImportResult>(
      '/api/agency/banner-studio/brand-kits/motorstack', { method: 'POST', body: { brandId } }
    ), () => stopping.value || disposed)
  } finally {
    busy.value = false
    if (!disposed) emit('complete')
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Import OEM brand kits"
    description="Bring MotorStack brands into the shared agency library."
    :dismissible="!busy"
    :close="!busy"
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-5">
        <UAlert
          icon="i-lucide-library"
          color="neutral"
          title="Shared kits, ready for review"
          description="Imports available fonts, logos and colours from MotorStack, with source notes. Existing kits stay unchanged. No dealership is assigned and no design is updated."
        />
        <div v-if="loading" role="status" class="flex items-center gap-2 py-8 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="animate-spin" />
          Loading MotorStack brands…
        </div>
        <UAlert
          v-else-if="error"
          color="error"
          title="Could not load MotorStack brands"
          :description="apiErrorDescription(error, 'Try loading the brand list again.')"
          :actions="[{ label: 'Retry loading', color: 'error', variant: 'soft', onClick: loadCatalog }]"
        />
        <template v-else-if="loaded">
          <UAlert
            v-for="warning in catalogWarnings"
            :key="warning"
            color="warning"
            :description="warning"
          />
          <p v-if="!rows.length" class="py-8 text-center text-sm text-muted">
            MotorStack has no brands available to import.
          </p>
          <template v-else>
            <div class="space-y-2" role="status" aria-live="polite">
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="font-medium">{{ busy ? `Importing ${current?.name || 'brands'}…` : `${rows.length} OEM brands` }}</span>
                <span class="tabular-nums text-muted">{{ finished }} / {{ rows.length }} processed</span>
              </div>
              <UProgress :model-value="finished" :max="rows.length" aria-label="Brand import progress" />
              <p v-if="finished" class="text-xs text-muted">
                {{ totals.imported }} imported · {{ totals.existing }} already saved · {{ totals.skipped }} skipped · {{ failed.length }} failed
              </p>
              <p v-if="stopping && busy" class="text-xs text-muted">
                Stopping after the current brand finishes.
              </p>
            </div>
            <ul class="max-h-[min(45vh,28rem)] overflow-y-auto divide-y divide-default rounded-lg border border-default" aria-label="MotorStack brand results">
              <li v-for="row in rows" :key="row.id" class="space-y-2 p-3 sm:p-4">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="break-words text-sm font-semibold">
                      {{ row.name }}
                    </p>
                    <p v-if="row.existingKitId && row.status === 'pending'" class="text-xs text-muted">
                      Existing kit will be kept
                    </p>
                  </div>
                  <UBadge :color="statusColor(row.status)" variant="subtle" class="shrink-0">
                    {{ statusLabels[row.status] }}
                  </UBadge>
                </div>
                <p v-if="row.result?.status === 'imported'" class="text-xs text-muted">
                  {{ row.result.counts.fonts }} font files · {{ row.result.counts.logos }} logos · {{ row.result.counts.colors }} colours
                </p>
                <ul v-if="row.result?.warnings.length" class="space-y-1 text-xs text-muted">
                  <li v-for="warning in row.result.warnings" :key="warning" class="flex gap-2">
                    <UIcon name="i-lucide-triangle-alert" class="mt-0.5 shrink-0 text-warning" />
                    <span>{{ warning }}</span>
                  </li>
                </ul>
                <div v-if="row.error" class="flex items-start justify-between gap-3">
                  <p class="text-xs text-error">
                    {{ row.error }}
                  </p>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    :disabled="busy"
                    :aria-label="`Retry ${row.name}`"
                    @click="start([row])"
                  >
                    Retry
                  </UButton>
                </div>
              </li>
            </ul>
            <p class="text-xs text-muted">
              Source warnings identify missing or unsupported assets. Review each imported kit before using it in artwork.
            </p>
          </template>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <template v-if="busy">
          <UButton
            color="neutral"
            variant="outline"
            :disabled="stopping"
            @click="stopping = true"
          >
            Stop after current
          </UButton>
        </template>
        <template v-else>
          <UButton color="neutral" variant="ghost" @click="open = false">
            Close
          </UButton>
          <UButton
            v-if="failed.length"
            color="neutral"
            variant="outline"
            @click="start(failed)"
          >
            Retry {{ failed.length }} failed
          </UButton>
          <UButton v-if="pending.length" icon="i-lucide-download" @click="start(pending)">
            {{ finished ? `Continue ${pending.length} remaining` : `Import all ${pending.length} brands` }}
          </UButton>
        </template>
      </div>
    </template>
  </UModal>
</template>
