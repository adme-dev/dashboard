<script setup lang="ts">
/**
 * Version history sidebar panel for the banner editor.
 * Shows list of auto-saved versions with restore capability.
 */
const props = defineProps<{ projectId: string }>()

const toast = useToast()
const { restoreCanvasData } = useBannerStudio()

const { data: versions, refresh, status } = useFetch<any[]>(
  () => `/api/agency/banner-studio/versions?projectId=${props.projectId}`,
  { default: () => [] },
)

const isRestoring = ref(false)
const confirmVersionId = ref<string | null>(null)
const showConfirm = computed({
  get: () => !!confirmVersionId.value,
  set: (v: boolean) => { if (!v) confirmVersionId.value = null },
})

async function restoreVersion(versionId: string) {
  isRestoring.value = true
  try {
    const result = await $fetch<any>('/api/agency/banner-studio/versions/restore', {
      method: 'POST',
      body: { versionId },
    })

    if (result?.canvasData) {
      const canvasData = typeof result.canvasData === 'string'
        ? JSON.parse(result.canvasData)
        : result.canvasData
      restoreCanvasData(canvasData)
    }

    confirmVersionId.value = null
    await refresh()
    toast.add({ title: 'Restored', description: 'Version restored successfully', color: 'success' })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to restore version', color: 'error' })
  } finally {
    isRestoring.value = false
  }
}

function formatTime(d: string) {
  if (!d) return ''
  const date = new Date(d)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
</script>

<template>
  <div class="p-3 space-y-2">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted)">Version History</h3>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="ghost"
        size="xs"
        :loading="status === 'pending'"
        @click="refresh"
      />
    </div>

    <!-- Loading -->
    <div v-if="status === 'pending' && !versions?.length" class="py-8 text-center">
      <UIcon name="i-lucide-loader-2" class="w-5 h-5 text-(--ui-text-muted) animate-spin mx-auto" />
    </div>

    <!-- Empty state -->
    <div v-else-if="!versions?.length" class="py-8 text-center">
      <UIcon name="i-lucide-history" class="w-8 h-8 text-(--ui-text-muted) mx-auto mb-2" />
      <p class="text-xs text-(--ui-text-muted)">No versions yet</p>
      <p class="text-[10px] text-(--ui-text-muted) mt-1">Versions are created automatically when you save</p>
    </div>

    <!-- Version list -->
    <div v-else class="space-y-1">
      <div
        v-for="v in versions"
        :key="v.id"
        class="group flex items-center gap-2 px-2 py-2 rounded-md hover:bg-(--ui-bg)/60 transition-colors"
      >
        <div class="w-6 h-6 rounded-full bg-(--ui-bg) flex items-center justify-center shrink-0">
          <span class="text-[10px] font-bold text-(--ui-text-muted)">{{ v.versionNumber }}</span>
        </div>

        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium truncate">
            {{ v.label || `Version ${v.versionNumber}` }}
          </div>
          <div class="text-[10px] text-(--ui-text-muted)">
            {{ formatTime(v.createdAt) }}
            <span v-if="v.createdByName"> · {{ v.createdByName }}</span>
          </div>
        </div>

        <UButton
          icon="i-lucide-rotate-ccw"
          variant="ghost"
          size="xs"
          class="opacity-0 group-hover:opacity-100 transition-opacity"
          title="Restore this version"
          @click="confirmVersionId = v.id"
        />
      </div>
    </div>

    <!-- Restore confirmation modal -->
    <UModal v-model:open="showConfirm">
      <template #content>
        <div class="p-5">
          <h3 class="text-sm font-bold mb-2">Restore Version?</h3>
          <p class="text-xs text-(--ui-text-muted) mb-4">
            This will replace your current canvas with the selected version.
            Your current state will be auto-saved as a new version first.
          </p>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" variant="ghost" size="sm" @click="confirmVersionId = null" />
            <UButton
              label="Restore"
              size="sm"
              :loading="isRestoring"
              @click="restoreVersion(confirmVersionId!)"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
