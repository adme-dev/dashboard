<script setup lang="ts">
import type { BannerProject } from '~/types/banner-studio'
import { bannerDimensions } from '~/utils/banner-library'

definePageMeta({ layout: false, middleware: ['role-creative'] })

const showImport = ref(false)
const { data: projects, status, refresh } = await useFetch<BannerProject[]>('/api/agency/banner-studio/projects', { default: () => [] })
const sorted = computed(() => [...(projects.value || [])].sort((a, b) =>
  new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()))
</script>

<template>
  <main class="min-h-dvh bg-default text-default">
    <header class="flex flex-wrap items-center justify-between gap-4 border-b border-default px-4 py-3 sm:px-8">
      <div class="flex items-center gap-3">
        <UButton to="https://creative.xeroflow.io/" icon="i-lucide-arrow-left" color="neutral" variant="ghost" aria-label="Back to Creative Suite" />
        <div>
          <h1 class="text-lg font-semibold">Banner Studio</h1>
          <p class="text-xs text-muted">Editable campaigns and every size in one canvas</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-file-up" color="neutral" variant="outline" @click="showImport = true">Import from TheBrief</UButton>
        <UButton to="/creative/banner-studio/new" icon="i-lucide-plus">New banner</UButton>
      </div>
    </header>
    <div class="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
      <div class="flex items-end justify-between gap-4">
        <div>
          <h2 class="text-2xl font-semibold">Your banners</h2>
          <p class="mt-1 text-sm text-muted">Open a design to edit its layouts, timeline and exports.</p>
        </div>
        <UBadge color="neutral" variant="subtle">{{ sorted.length }} projects</UBadge>
      </div>
      <div v-if="status === 'pending'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <USkeleton v-for="n in 6" :key="n" class="h-36" />
      </div>
      <UAlert v-else-if="status === 'error'" title="Could not load banners" description="Try again in a moment." color="error" :actions="[{ label: 'Retry', onClick: refresh }]" />
      <div v-else-if="sorted.length" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UCard v-for="project in sorted" :key="project.id" class="min-w-0">
          <div class="flex h-full flex-col gap-4">
            <div>
              <div class="flex items-start justify-between gap-3">
                <h3 class="truncate font-medium">{{ project.name }}</h3>
                <UBadge v-if="project.tags?.includes('import:needs-review')" color="warning" variant="subtle" size="xs">Review</UBadge>
              </div>
              <p class="mt-2 text-xs text-muted">{{ project.clientName || 'Unassigned' }} · {{ bannerDimensions(project.canvasData) }}</p>
            </div>
            <UButton :to="`/creative/banner-studio/${project.id}`" color="neutral" variant="outline" icon="i-lucide-arrow-up-right" class="mt-auto self-start">Open editor</UButton>
          </div>
        </UCard>
      </div>
      <div v-else class="rounded-xl border border-default p-12 text-center">
        <UIcon name="i-lucide-images" class="mx-auto mb-3 size-8 text-muted" />
        <p class="font-medium">Your banner library starts here</p>
        <p class="mt-1 text-sm text-muted">Create a banner or import a reviewed TheBrief export.</p>
      </div>
    </div>
    <BannerTheBriefImportModal v-model:open="showImport" @imported="refresh" />
  </main>
</template>
