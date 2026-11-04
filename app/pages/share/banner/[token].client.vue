<script setup lang="ts">
import type { ArtboardState } from '~/types/banner-studio'
import type { ExportCustomFont } from '~/utils/banner-html-builder'

definePageMeta({ layout: false, auth: false })
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })
const route = useRoute()
const token = String(route.params.token)
const data = shallowRef<{ project: { name: string, clientName?: string | null, canvasData: Record<string, ArtboardState> | string }, fonts: Array<{ id?: string, name: string, url: string, tags: string[] }> } | null>(null)
const error = ref('')

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
  return /^https?:\/\//.test(font.url) ? [{ id: font.id, family: font.name, url: font.url, format, weight }] : []
}))
</script>

<template>
  <main class="flex h-dvh flex-col overflow-hidden bg-default text-default">
    <header class="flex shrink-0 items-center gap-3 border-b border-default px-4 py-3 sm:gap-4 sm:px-6">
      <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-elevated ring-1 ring-default">
        <UIcon name="i-lucide-gallery-vertical-end" class="size-5" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">
          Banner Studio / Client presentation
        </p>
        <h1 class="mt-0.5 truncate text-base font-semibold tracking-tight sm:text-xl" :title="data?.project.name">
          {{ data?.project.name || 'Shared banner' }}
        </h1>
      </div>
      <UBadge
        label="View only"
        icon="i-lucide-eye"
        color="neutral"
        variant="subtle"
        class="hidden rounded-full sm:inline-flex"
      />
    </header>
    <UAlert
      v-if="error"
      class="m-6"
      color="warning"
      title="Preview unavailable"
      :description="error"
    />
    <BannerSavedPreview
      v-else
      :canvas="canvas"
      :fonts="customFonts"
      :client-name="data?.project.clientName"
      :project-name="data?.project.name"
    />
  </main>
</template>
