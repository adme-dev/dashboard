<script setup lang="ts">
import { AD_PLATFORM_LIST, AD_PLATFORMS, type AdPlatformSpec } from '~/utils/ad-platform-specs'

const props = defineProps<{
  instanceId: string
  instanceName: string
  width: number
  height: number
}>()

const open = defineModel<boolean>('open', { default: false })

const selectedPlatform = ref<string>('generic_iab')
const exporting = ref(false)

interface ExportResult {
  zipBase64: string
  filename: string
  htmlSize: number
  zipSize: number
  warnings: { rule: string; message: string; severity: 'error' | 'warning' }[]
}
const exportResult = ref<ExportResult | null>(null)

const platform = computed<AdPlatformSpec | undefined>(() => AD_PLATFORMS[selectedPlatform.value])

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

function selectPlatform(id: string) {
  selectedPlatform.value = id
  exportResult.value = null
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return 'No limit'
  if (bytes < 1024) return `${bytes}B`
  return `${Math.round(bytes / 1024)}KB`
}

async function doExport() {
  exporting.value = true
  exportResult.value = null

  try {
    const result = await apiFetch<ExportResult>(
      `/api/agency/banner-studio/custom-instances/${props.instanceId}/export`,
      { method: 'POST', body: { platform: selectedPlatform.value } },
    )

    exportResult.value = result

    // Trigger download
    const binaryStr = atob(result.zipBase64)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    const hasErrors = result.warnings.some(w => w.severity === 'error')
    toast.add({
      title: hasErrors ? 'Exported with issues' : 'Export complete',
      description: `${result.filename} (${formatBytes(result.zipSize)})`,
      color: hasErrors ? 'warning' : 'success',
    })
  } catch (err: any) {
    toast.add({
      title: 'Export failed',
      description: err?.data?.statusMessage || err?.message || 'Unknown error',
      color: 'error',
    })
  } finally {
    exporting.value = false
  }
}

// Requirements list for the selected platform
const requirements = computed(() => {
  const p = platform.value
  if (!p) return []
  const items: { label: string; value: string; ok: boolean }[] = []

  items.push({
    label: 'Max file size',
    value: p.maxFileSize ? formatBytes(p.maxFileSize) : 'No limit',
    ok: true,
  })
  items.push({
    label: 'Animation limit',
    value: p.animationLimitSec ? `${p.animationLimitSec}s max` : 'Unlimited',
    ok: true,
  })
  items.push({
    label: 'External calls',
    value: p.allowsExternalCalls ? 'Allowed' : 'Not allowed',
    ok: p.allowsExternalCalls,
  })
  items.push({
    label: 'Looping',
    value: p.allowsLooping ? 'Allowed' : 'Not allowed',
    ok: p.allowsLooping,
  })
  if (p.requiresExternalLib) {
    items.push({
      label: 'Required library',
      value: p.requiresExternalLib.note,
      ok: true,
    })
  }
  return items
})

// Size meter for export result
const sizePercent = computed(() => {
  if (!exportResult.value || !platform.value?.maxFileSize) return 0
  return Math.round((exportResult.value.htmlSize / platform.value.maxFileSize) * 100)
})

const sizeColor = computed(() => {
  if (sizePercent.value > 100) return 'error'
  if (sizePercent.value > 80) return 'warning'
  return 'success'
})
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'sm:max-w-xl' }">
    <template #content>
      <div class="p-5 space-y-4">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Export for Ad Platform</h2>
          <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="open = false" />
        </div>

        <!-- Platform grid -->
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="p in AD_PLATFORM_LIST"
            :key="p.id"
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors border"
            :class="selectedPlatform === p.id
              ? 'border-primary bg-primary/10 text-default'
              : 'border-default hover:bg-elevated text-muted hover:text-default'"
            @click="selectPlatform(p.id)"
          >
            <UIcon :name="p.icon" class="shrink-0 text-base" />
            <span class="truncate">{{ p.name }}</span>
          </button>
        </div>

        <!-- Requirements panel -->
        <div v-if="platform" class="rounded-lg border border-default p-3 space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Requirements</h3>
          <div v-for="req in requirements" :key="req.label" class="flex items-center gap-2 text-sm">
            <UIcon
              :name="req.ok ? 'i-lucide-check-circle' : 'i-lucide-alert-circle'"
              :class="req.ok ? 'text-success' : 'text-warning'"
              class="shrink-0"
            />
            <span class="text-muted">{{ req.label }}:</span>
            <span class="font-medium">{{ req.value }}</span>
          </div>
          <p v-if="platform.notes" class="text-xs text-muted mt-1">{{ platform.notes }}</p>
        </div>

        <!-- Validation results (after export) -->
        <div v-if="exportResult" class="rounded-lg border border-default p-3 space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Validation</h3>

          <!-- Size meter -->
          <div v-if="platform?.maxFileSize" class="space-y-1">
            <div class="flex justify-between text-xs">
              <span class="text-muted">File size</span>
              <span :class="sizePercent > 100 ? 'text-error font-medium' : 'text-muted'">
                {{ formatBytes(exportResult.htmlSize) }} / {{ formatBytes(platform.maxFileSize) }}
              </span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-elevated overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="{
                  'bg-success': sizeColor === 'success',
                  'bg-warning': sizeColor === 'warning',
                  'bg-error': sizeColor === 'error',
                }"
                :style="{ width: `${Math.min(sizePercent, 100)}%` }"
              />
            </div>
          </div>
          <div v-else class="text-xs text-muted">
            File size: {{ formatBytes(exportResult.htmlSize) }} (no limit)
          </div>

          <!-- Warnings -->
          <div
            v-for="(warn, i) in exportResult.warnings"
            :key="i"
            class="flex items-start gap-2 text-sm"
          >
            <UIcon
              :name="warn.severity === 'error' ? 'i-lucide-x-circle' : 'i-lucide-alert-triangle'"
              :class="warn.severity === 'error' ? 'text-error' : 'text-warning'"
              class="shrink-0 mt-0.5"
            />
            <span>{{ warn.message }}</span>
          </div>

          <div v-if="exportResult.warnings.length === 0" class="flex items-center gap-2 text-sm text-success">
            <UIcon name="i-lucide-check-circle" />
            All checks passed
          </div>
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-2 pt-2">
          <UButton label="Close" variant="outline" size="sm" @click="open = false" />
          <UButton
            label="Download ZIP"
            icon="i-lucide-download"
            color="primary"
            size="sm"
            :loading="exporting"
            @click="doExport"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
