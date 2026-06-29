<script setup lang="ts">
import { formatDistanceToNow, parseISO } from 'date-fns'

const activeFilter = ref<'all' | 'proofs' | 'attachments'>('all')

const { data, status } = await useFetch('/api/agency/dashboard/recent-creatives', {
  query: computed(() => ({ source: activeFilter.value, limit: 20 })),
  watch: [activeFilter],
})

const creatives = computed(() => (data.value as any)?.creatives || [])

const formatSize = (bytes: number) => {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

// Keyed to the real creative_proofs status enum (no 'pending_review'/'final' exist).
const proofStatusColors: Record<string, string> = {
  draft: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  internal_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  client_review: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  changes_requested: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  archived: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500',
}

const proofStatusLabels: Record<string, string> = {
  draft: 'Draft',
  internal_review: 'Internal Review',
  client_review: 'Client Review',
  changes_requested: 'Changes',
  approved: 'Approved',
  rejected: 'Rejected',
  archived: 'Archived',
}

const timeAgo = (date: string) => {
  try {
    return formatDistanceToNow(parseISO(date), { addSuffix: true })
  } catch {
    return ''
  }
}

const filters = [
  { key: 'all' as const, label: 'All' },
  { key: 'proofs' as const, label: 'Proofs' },
  { key: 'attachments' as const, label: 'Uploads' },
]
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-image" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Recent Creatives</h3>
          <UBadge v-if="creatives.length" variant="subtle" color="neutral" size="xs">{{ creatives.length }}</UBadge>
        </div>
        <UButton to="/agency/proofs" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          Proofs
        </UButton>
      </div>
    </template>

    <!-- Filter tabs -->
    <div class="flex items-center gap-1 mb-4">
      <button
        v-for="f in filters"
        :key="f.key"
        class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors"
        :class="activeFilter === f.key
          ? 'bg-[var(--ui-bg-inverted)] text-[var(--ui-text-inverted)]'
          : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-bg-elevated)]'"
        @click="activeFilter = f.key"
      >
        {{ f.label }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="status === 'pending'" class="grid grid-cols-3 gap-2">
      <USkeleton v-for="i in 6" :key="i" class="aspect-square rounded-lg" />
    </div>

    <!-- Empty state -->
    <div v-else-if="!creatives.length" class="text-center py-8">
      <div class="w-12 h-12 rounded-full bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center mx-auto mb-3">
        <UIcon name="i-lucide-image-off" class="w-6 h-6 text-violet-600 dark:text-violet-400" />
      </div>
      <p class="text-sm font-medium text-[var(--ui-text-highlighted)]">No recent creatives</p>
      <p class="text-xs text-[var(--ui-text-muted)] mt-1">Visual assets will appear here as they're uploaded</p>
    </div>

    <!-- Masonry grid -->
    <div v-else class="grid grid-cols-3 gap-2">
      <div
        v-for="item in creatives"
        :key="`${item.source}-${item.id}`"
        class="group relative aspect-square rounded-lg overflow-hidden bg-[var(--ui-bg-elevated)] border border-[var(--ui-border)] hover:border-[var(--ui-border-accented)] transition-all cursor-pointer"
      >
        <!-- Thumbnail or file type icon -->
        <img
          v-if="safeMediaUrl(item.thumbnailUrl) || (!item.isVideo && safeMediaUrl(item.fileUrl))"
          :src="safeMediaUrl(item.thumbnailUrl) || safeMediaUrl(item.fileUrl)"
          :alt="item.fileName"
          class="w-full h-full object-cover"
          loading="lazy"
        />
        <div v-else class="w-full h-full flex flex-col items-center justify-center gap-1.5">
          <UIcon
            :name="item.isVideo ? 'i-lucide-film' : 'i-lucide-image'"
            class="w-6 h-6 text-[var(--ui-text-muted)]"
          />
          <span class="text-[9px] text-[var(--ui-text-muted)] uppercase font-medium tracking-wide">
            {{ item.fileType?.split('/')[1]?.toUpperCase() || 'FILE' }}
          </span>
        </div>

        <!-- Video indicator -->
        <div v-if="item.isVideo" class="absolute top-1.5 left-1.5">
          <div class="w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
            <UIcon name="i-lucide-play" class="w-3 h-3 text-white" />
          </div>
        </div>

        <!-- Source badge -->
        <div class="absolute top-1.5 right-1.5">
          <div
            class="px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider"
            :class="item.source === 'proof'
              ? 'bg-violet-500/80 text-white'
              : 'bg-blue-500/80 text-white'"
          >
            {{ item.source === 'proof' ? 'QR' : 'DD' }}
          </div>
        </div>

        <!-- Hover overlay -->
        <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
          <!-- Proof status -->
          <div v-if="item.proof" class="mb-1">
            <span
              class="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium"
              :class="proofStatusColors[item.proof.status] || 'bg-neutral-100 text-neutral-700'"
            >
              {{ proofStatusLabels[item.proof.status] || item.proof.status }}
              <span v-if="item.proof.version"> v{{ item.proof.version }}</span>
            </span>
          </div>

          <!-- File name -->
          <p class="text-[10px] text-white font-medium truncate leading-tight">
            {{ item.proof?.name || item.task?.title || item.fileName }}
          </p>

          <!-- Context line -->
          <div class="flex items-center gap-1 mt-0.5">
            <UAvatar
              v-if="item.uploader"
              :src="item.uploader.avatarUrl || undefined"
              :alt="item.uploader.name"
              size="3xs"
            />
            <span class="text-[9px] text-white/70 truncate">
              {{ item.client?.name || item.department || '' }}
              <span v-if="item.client?.name && item.department"> &middot; </span>
              {{ item.client?.name ? '' : '' }}{{ timeAgo(item.createdAt) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div v-if="creatives.length >= 12" class="mt-3 pt-3 border-t border-[var(--ui-border)]">
      <UButton to="/agency/proofs" variant="link" color="neutral" size="xs" class="w-full justify-center" trailing-icon="i-lucide-arrow-right">
        View All Creatives
      </UButton>
    </div>
  </UCard>
</template>
