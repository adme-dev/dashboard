<script setup lang="ts">
import type { BannerLibraryItem } from '~/utils/banner-library'
import { libraryDate } from '~/utils/banner-library'

defineProps<{ items: BannerLibraryItem[], view: 'list' | 'grid', contextLabel: string }>()
defineEmits<{ open: [id: string] }>()
</script>

<template>
  <div class="@container">
    <div :class="view === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] items-start gap-x-5 gap-y-7' : 'divide-y divide-default rounded-lg border border-default'">
      <div v-if="view === 'list'" class="hidden items-center gap-4 bg-elevated/50 px-4 py-2 text-xs font-medium text-muted @4xl:grid @4xl:grid-cols-[minmax(240px,2fr)_minmax(110px,1fr)_minmax(120px,1fr)_100px_110px_32px]" aria-hidden="true">
        <span>Name</span><span>{{ contextLabel }}</span><span>Dimensions</span><span>Type</span><span>Dates</span><span />
      </div>
      <article v-for="item in items" :key="item.id" :class="view === 'grid' ? 'group relative min-w-0 @container/card' : 'flex items-center gap-4 p-3 @4xl:grid @4xl:grid-cols-[minmax(240px,2fr)_minmax(110px,1fr)_minmax(120px,1fr)_100px_110px_32px] @4xl:px-4'">
        <div :class="view === 'grid' ? '' : 'flex min-w-0 flex-1 items-center gap-3'">
          <UButton
            :to="item.to"
            :aria-label="`Open ${item.name}`"
            :title="item.dimensions"
            variant="link"
            color="neutral"
            class="p-0"
            :class="view === 'grid' ? 'relative flex w-full overflow-hidden rounded-xl ring-1 ring-default transition-shadow hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary' : 'shrink-0'"
            @click="!item.to && $emit('open', item.id)"
          >
            <BannerLibraryThumbnail
              :thumbnail-url="item.thumbnailUrl"
              :canvas-data="item.canvasData"
              :client-id="item.clientId"
              :class="view === 'grid' ? 'aspect-square w-full' : 'h-12 w-20 rounded'"
            />
            <span v-if="view === 'grid'" class="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-default/90 px-2 py-1 text-[11px] font-medium text-default shadow-sm">
              {{ item.type }}
            </span>
          </UButton>
          <div class="min-w-0" :class="view === 'grid' ? 'pr-9 pt-3' : ''">
            <UButton
              :to="item.to"
              :label="item.name"
              :title="item.name"
              variant="link"
              color="neutral"
              class="max-w-full p-0 text-left font-medium text-default"
              :ui="{ label: 'truncate' }"
              @click="!item.to && $emit('open', item.id)"
            />
            <p v-if="view === 'list'" class="mt-1 truncate text-xs text-muted @4xl:hidden">
              {{ item.client }} · {{ item.dimensions }}
            </p>
            <p v-if="view === 'list'" class="mt-1 text-xs text-muted @4xl:hidden">
              {{ item.type }} · {{ item.sourceCreatedDate !== undefined ? `Original creation: ${item.sourceCreatedDate ? libraryDate(item.sourceCreatedDate) : 'unverified'} · ` : '' }}{{ item.dateLabel || (item.sourceCreatedDate !== undefined ? 'Modified ' : '') }}{{ libraryDate(item.date) }}
            </p>
            <p v-if="item.category && view === 'list'" class="mt-1 truncate text-xs text-muted">
              {{ item.category }}
            </p>
          </div>
        </div>
        <p class="truncate text-xs text-muted" :class="view === 'grid' ? 'pt-1' : 'hidden @4xl:block'" :title="item.client">
          {{ item.client }}<span v-if="view === 'grid' && item.category"> · {{ item.category }}</span>
        </p>
        <p v-if="view === 'list'" class="text-xs text-muted hidden @4xl:line-clamp-2" :title="item.dimensions">
          {{ item.dimensions }}
        </p>
        <p v-if="view === 'list'" class="hidden text-xs text-muted @4xl:block">
          {{ item.type }}
        </p>
        <div class="text-xs text-muted" :class="view === 'grid' ? 'pt-1 text-[11px]' : 'hidden @4xl:block'">
          <p v-if="item.sourceCreatedDate !== undefined">
            Original creation: {{ item.sourceCreatedDate ? libraryDate(item.sourceCreatedDate) : 'unverified' }}
          </p>
          <p>{{ item.dateLabel || (item.sourceCreatedDate !== undefined ? 'Modified ' : '') }}{{ libraryDate(item.date) }}</p>
        </div>
        <div :class="view === 'grid' ? 'absolute right-0 top-[calc(100cqw+0.5rem)]' : 'shrink-0'">
          <slot :id="item.id" name="actions" />
        </div>
      </article>
    </div>
  </div>
</template>
