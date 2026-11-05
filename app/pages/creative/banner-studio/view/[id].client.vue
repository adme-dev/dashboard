<script setup lang="ts">
import type { ArtboardState } from '~/types/banner-studio'

definePageMeta({ layout: false, middleware: ['role-creative'] })
const route = useRoute()
const projectId = String(route.params.id)
const snapshot = shallowRef<{ clientId?: string | null, clientName?: string | null, name: string, canvasData: Record<string, ArtboardState>, revision: string } | null>(null)
const unavailable = ref(false)
const loading = ref(true)
const fontsReady = ref(false)
const downloadsOpen = ref(false)
const { fetchCustomFonts, getExportCustomFonts } = useBannerFonts(() => snapshot.value?.clientId ?? null)
let disposed = false
let timer: ReturnType<typeof setTimeout> | undefined
async function refresh() {
  try {
    const next = await $fetch<typeof snapshot.value>(`/api/agency/banner-studio/projects/${projectId}/snapshot`)
    if (!disposed && next) {
      if (snapshot.value?.revision !== next.revision || snapshot.value?.clientId !== next.clientId) {
        snapshot.value = next
        await fetchCustomFonts()
        fontsReady.value = true
      } else if (snapshot.value.clientName !== next.clientName) {
        snapshot.value = next
      }
      unavailable.value = false
    }
  } catch (error) {
    const status = error as { statusCode?: number, status?: number }
    if (!disposed) {
      unavailable.value = true
      if ([401, 403, 404].includes(status?.statusCode || status?.status || 0)) {
        snapshot.value = null
      }
    }
  } finally {
    if (!disposed) {
      loading.value = false
      timer = setTimeout(refresh, 5000)
    }
  }
}
const customFonts = computed(() => snapshot.value && fontsReady.value
  ? getExportCustomFonts(Object.values(snapshot.value.canvasData).flatMap(board => board.layers || []))
  : [])
onMounted(() => {
  void refresh()
})
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(timer)
})
</script>

<template>
  <main class="flex h-dvh flex-col overflow-hidden bg-default text-default">
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-default px-4 py-3 sm:px-8">
      <div>
        <h1 class="text-lg font-semibold">
          {{ snapshot?.name || 'Saved banner viewer' }}
        </h1>
        <p class="text-sm text-muted">
          Latest saved layouts · Updates automatically
        </p>
      </div>
      <div class="flex items-center gap-2">
        <BannerThemeToggle />
        <UButton
          label="MP4 downloads"
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          :disabled="!snapshot"
          @click="downloadsOpen = true"
        />
        <UButton
          :to="`/creative/banner-studio/${projectId}`"
          icon="i-lucide-pencil"
          color="neutral"
          variant="outline"
        >
          Open editor
        </UButton>
      </div>
    </header>
    <UAlert
      v-if="unavailable"
      class="m-4 shrink-0"
      color="warning"
      title="Waiting for a saved preview"
      :description="snapshot ? 'Showing the last loaded version. The latest changes are not available yet; retrying automatically.' : 'Save the project in its editor. This viewer will refresh automatically when the snapshot is ready.'"
    />
    <USkeleton v-if="loading" class="m-4 h-64" />
    <BannerSavedPreview
      v-if="snapshot && fontsReady"
      :canvas="snapshot.canvasData"
      :fonts="customFonts"
      :client-name="snapshot.clientName"
      :project-name="snapshot.name"
    />
    <BannerVideoDownloads
      v-if="snapshot"
      v-model:open="downloadsOpen"
      :project-id="projectId"
      :project-name="snapshot.name"
      :client-id="snapshot.clientId"
      :editor-url="`/creative/banner-studio/${projectId}`"
    />
  </main>
</template>
