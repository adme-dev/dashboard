<script setup lang="ts">
import type { ArtboardState } from '~/types/banner-studio'

definePageMeta({ layout: false, auth: false })
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })
if (import.meta.server) {
  useResponseHeader('Cache-Control').value = 'no-store'
  useResponseHeader('Referrer-Policy').value = 'no-referrer'
}
const route = useRoute()
const token = String(route.params.token)
const { data, error: requestError } = await useFetch<{
  project: { name: string, clientName?: string | null, canvasData: Record<string, ArtboardState> | string, updatedAt?: string }
  fonts: Array<{ id?: string, name: string, url: string, tags: string[] }>
  videos: Array<{ formatKey: string, revision: string, status: string, url: string | null, canRetry: boolean }>
}>(`/api/public/banner-share/${token}`)
const error = computed(() => requestError.value
  ? requestError.value.data?.statusMessage || 'This link has expired, was revoked, or is unavailable.'
  : '')
const origin = useRequestURL().origin
const image = computed(() => data.value
  ? `${origin}/api/public/banner-share/${encodeURIComponent(token)}/image?v=${encodeURIComponent(data.value.project.updatedAt || '1')}`
  : '')
useSeoMeta({
  title: () => data.value?.project.name || 'Shared banner unavailable',
  description: () => data.value ? `View ${data.value.project.name} — artwork preview.` : error.value,
  ogTitle: () => data.value?.project.name || 'Shared banner unavailable',
  ogDescription: () => data.value ? 'View the artwork and play its animation.' : error.value,
  ogImage: image,
  ogImageAlt: () => data.value?.project.name || '',
  ogType: 'website',
  ogUrl: () => `${origin}/share/banner/${encodeURIComponent(token)}`,
  twitterImage: image,
  twitterCard: 'summary_large_image',
  robots: 'noindex, nofollow'
})

const canvas = computed<Record<string, ArtboardState>>(() => {
  const value = data.value?.project.canvasData
  if (!value) return {}
  try {
    return typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    return {}
  }
})
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
    <BannerClientVideoPreview
      v-else
      :canvas="canvas"
      :share-token="token"
      :initial-videos="data?.videos"
      :client-name="data?.project.clientName"
      :project-name="data?.project.name"
    />
  </main>
</template>
