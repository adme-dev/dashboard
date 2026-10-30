<script setup lang="ts">
import type { ArtboardState } from '~/types/banner-studio'
import { buildBannerHTML, type ExportCustomFont } from '~/utils/banner-html-builder'
import { resolveBannerFormat } from '~/utils/banner-constants'

definePageMeta({ layout: false, auth: false })
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })
const route = useRoute()
const token = String(route.params.token)
const data = shallowRef<{ project: { name: string, canvasData: Record<string, ArtboardState> | string }, fonts: Array<{ name: string, url: string, tags: string[] }> } | null>(null)
const error = ref('')
const playing = ref<string | null>(null)

try {
  data.value = await $fetch<typeof data.value>(`/api/public/banner-share/${token}`)
} catch (cause) {
  error.value = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage || 'This link has expired, was revoked, or is unavailable.'
}

const canvas = computed<Record<string, ArtboardState>>(() => {
  const value = data.value?.project.canvasData
  if (!value) return {}
  try {
    return typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    return {}
  }
})
const customFonts = computed<ExportCustomFont[]>(() => (data.value?.fonts || []).flatMap((font) => {
  const weight = Number(font.tags.find(tag => tag.startsWith('weight:'))?.slice(7) || 400)
  const format = font.tags.find(tag => tag.startsWith('format:'))?.slice(7) || 'woff2'
  return /^https?:\/\//.test(font.url) ? [{ family: font.name, url: font.url, format, weight }] : []
}))
const layouts = computed(() => Object.entries(canvas.value).flatMap(([key, board]) => {
  const format = resolveBannerFormat(key)
  if (!format || !Array.isArray(board?.layers)) return []
  return [{ key, format, html: buildBannerHTML(key, board.layers, {
    includeAnimations: playing.value === key,
    playback: board.playback,
    bgColor: board.bgColor || '#0a0a10',
    customFonts: customFonts.value
  }) }]
}))
</script>

<template>
  <main class="min-h-dvh bg-default text-default">
    <header class="border-b border-default px-4 py-4 sm:px-8">
      <div class="mx-auto max-w-7xl">
        <p class="text-xs font-semibold uppercase tracking-wider text-muted">
          Banner Studio · Client preview
        </p>
        <h1 class="mt-1 text-xl font-semibold">
          {{ data?.project.name || 'Shared banner' }}
        </h1>
        <p class="mt-1 text-sm text-muted">
          View the current saved layouts. Playback is available for each size.
        </p>
      </div>
    </header>
    <div class="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <UAlert
        v-if="error"
        color="warning"
        title="Preview unavailable"
        :description="error"
      />
      <UAlert
        v-else-if="!layouts.length"
        color="warning"
        title="No preview sizes"
        description="The shared banner has no renderable sizes yet."
      />
      <div v-else class="grid items-start gap-8 md:grid-cols-2 xl:grid-cols-3">
        <section v-for="layout in layouts" :key="layout.key" class="min-w-0 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-medium">
              {{ layout.format.w }} × {{ layout.format.h }}
            </h2>
            <UButton
              :icon="playing === layout.key ? 'i-lucide-square' : 'i-lucide-play'"
              color="neutral"
              variant="outline"
              size="sm"
              @click="playing = playing === layout.key ? null : layout.key"
            >
              {{ playing === layout.key ? 'Stop' : 'Play' }}
            </UButton>
          </div>
          <BannerSavedViewerFrame
            :html="layout.html"
            :width="layout.format.w"
            :height="layout.format.h"
            :title="`${layout.format.w} × ${layout.format.h} preview`"
          />
        </section>
      </div>
    </div>
  </main>
</template>
