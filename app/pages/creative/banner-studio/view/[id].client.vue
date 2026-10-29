<script setup lang="ts">
import type { ArtboardState } from '~/types/banner-studio'
import { buildBannerHTML } from '~/utils/banner-html-builder'
import { resolveBannerFormat } from '~/utils/banner-constants'

definePageMeta({ layout: false, middleware: ['role-creative'] })
const route = useRoute()
const projectId = String(route.params.id)
const snapshot = shallowRef<{ name: string, canvasData: Record<string, ArtboardState>, revision: string } | null>(null)
const unavailable = ref(false)
const loading = ref(true)
const playing = ref<string | null>(null)
const fontsReady = ref(false)
const { fetchCustomFonts, getExportCustomFonts } = useBannerFonts()
let disposed = false
let timer: ReturnType<typeof setTimeout> | undefined
async function refresh() {
  try {
    const next = await $fetch<typeof snapshot.value>(`/api/agency/banner-studio/projects/${projectId}/snapshot`)
    if (!disposed && next) {
      if (snapshot.value?.revision !== next.revision) {
        snapshot.value = next
        playing.value = null
        await fetchCustomFonts()
        fontsReady.value = true
      }
      unavailable.value = false
    }
  } catch (error: any) {
    if (!disposed) {
      unavailable.value = true
      if ([401, 403, 404].includes(error?.statusCode || error?.status)) { snapshot.value = null; playing.value = null }
    }
  } finally {
    if (!disposed) {
      loading.value = false
      timer = setTimeout(refresh, 5000)
    }
  }
}
const layouts = computed(() => {
  if (!snapshot.value || !fontsReady.value) return []
  return Object.entries(snapshot.value.canvasData).flatMap(([key, board]) => {
    const format = resolveBannerFormat(key)
    if (!format || !Array.isArray(board.layers)) return []
    return [{ key, format, html: buildBannerHTML(key, board.layers, {
      includeAnimations: playing.value === key,
      playback: board.playback,
      bgColor: board.bgColor || '#0a0a10',
      customFonts: getExportCustomFonts(board.layers),
    }) }]
  })
})
onMounted(() => { void refresh() })
onBeforeUnmount(() => { disposed = true; clearTimeout(timer) })
</script>

<template>
  <main class="min-h-dvh bg-default text-default">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-default px-4 py-3 sm:px-8">
      <div>
        <h1 class="text-lg font-semibold">{{ snapshot?.name || 'Saved banner viewer' }}</h1>
        <p class="text-sm text-muted">Latest saved layouts · Updates automatically</p>
      </div>
      <div class="flex items-center gap-2">
        <BannerThemeToggle />
        <UButton :to="`/creative/banner-studio/${projectId}`" icon="i-lucide-pencil" color="neutral" variant="outline">Open editor</UButton>
      </div>
    </header>
    <div class="space-y-6 p-4 sm:p-8">
      <UAlert v-if="unavailable" color="warning" title="Waiting for a saved preview" :description="snapshot ? 'Showing the last loaded version. The latest changes are not available yet; retrying automatically.' : 'Save the project in its editor. This viewer will refresh automatically when the snapshot is ready.'" />
      <USkeleton v-if="loading" class="h-64" />
      <div class="grid items-start gap-8 md:grid-cols-2 xl:grid-cols-3">
        <section v-for="layout in layouts" :key="layout.key" class="min-w-0 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-medium">{{ layout.format.name }} · {{ layout.format.w }} × {{ layout.format.h }}</h2>
            <UButton :icon="playing === layout.key ? 'i-lucide-square' : 'i-lucide-play'" color="neutral" variant="ghost" size="sm" @click="playing = playing === layout.key ? null : layout.key">{{ playing === layout.key ? 'Stop' : 'Play' }}</UButton>
          </div>
          <BannerSavedViewerFrame :html="layout.html" :width="layout.format.w" :height="layout.format.h" :title="layout.format.name" />
        </section>
      </div>
    </div>
  </main>
</template>
