<script setup lang="ts">
import type { BannerLibraryItem } from '~/utils/banner-library'
import { libraryDate } from '~/utils/banner-library'

defineProps<{ items: BannerLibraryItem[], view: 'list' | 'grid', contextLabel: string }>()
defineEmits<{ open: [id: string] }>()
</script>

<template>
  <div class="@container">
    <div :class="view === 'grid' ? 'grid grid-cols-1 gap-4 @md:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4' : 'divide-y divide-default rounded-lg border border-default'">
      <div v-if="view === 'list'" class="hidden items-center gap-4 bg-elevated/50 px-4 py-2 text-xs font-medium text-muted @4xl:grid @4xl:grid-cols-[minmax(240px,2fr)_minmax(110px,1fr)_minmax(120px,1fr)_100px_110px_32px]" aria-hidden="true">
        <span>Name</span><span>{{ contextLabel }}</span><span>Dimensions</span><span>Type</span><span>Last modified</span><span />
      </div>
      <article v-for="item in items" :key="item.id" :class="view === 'grid' ? 'min-w-0 overflow-hidden rounded-lg border border-default bg-default' : 'flex items-center gap-4 p-3 @4xl:grid @4xl:grid-cols-[minmax(240px,2fr)_minmax(110px,1fr)_minmax(120px,1fr)_100px_110px_32px] @4xl:px-4'">
        <div :class="view === 'grid' ? '' : 'flex min-w-0 flex-1 items-center gap-3'">
          <BannerLibraryThumbnail :thumbnail-url="item.thumbnailUrl" :canvas-data="item.canvasData" :class="view === 'grid' ? 'h-40 w-full border-b border-default' : 'h-12 w-20 shrink-0 rounded'" />
          <div class="min-w-0" :class="view === 'grid' ? 'px-3 pt-3' : ''">
            <UButton
              :to="item.to"
              :label="item.name"
              :title="item.name"
              variant="link"
              color="neutral"
              class="max-w-full p-0 text-left font-medium"
              :ui="{ label: 'truncate' }"
              @click="!item.to && $emit('open', item.id)"
            />
            <p v-if="view === 'list'" class="mt-1 truncate text-xs text-muted @4xl:hidden">
              {{ item.client }} · {{ item.dimensions }}
            </p>
            <p v-if="view === 'list'" class="mt-1 text-xs text-muted @4xl:hidden">
              {{ item.type }} · {{ item.dateLabel }}{{ libraryDate(item.date) }}
            </p>
            <p v-if="item.category" class="mt-1 truncate text-xs text-muted">
              {{ item.category }}
            </p>
          </div>
        </div>
        <p class="truncate text-xs text-muted" :class="view === 'grid' ? 'px-3 pt-1' : 'hidden @4xl:block'" :title="item.client">
          {{ item.client }}
        </p>
        <p class="text-xs text-muted" :class="view === 'grid' ? 'px-3 pt-2' : 'hidden @4xl:line-clamp-2'" :title="item.dimensions">
          {{ item.dimensions }}
        </p>
        <p class="text-xs text-muted" :class="view === 'grid' ? 'px-3 pt-1' : 'hidden @4xl:block'">
          {{ item.type }}
        </p>
        <p class="text-xs text-muted" :class="view === 'grid' ? 'px-3 pt-2' : 'hidden @4xl:block'">
          {{ item.dateLabel }}{{ libraryDate(item.date) }}
        </p>
        <div :class="view === 'grid' ? 'flex items-center justify-end px-3 pb-3' : 'shrink-0'">
          <slot :id="item.id" name="actions" />
        </div>
      </article>
    </div>
  </div>
</template>
