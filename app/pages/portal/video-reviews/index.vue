<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { data, pending } = useFetch('/api/portal/video-reviews')

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

const statusColors: Record<string, string> = {
  pending: 'info',
  approved: 'success',
  rejected: 'error',
  revision_requested: 'warning'
}
</script>

<template>
  <div class="p-6 space-y-6 w-full">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        Video Reviews
      </h1>
    </div>

    <div v-if="pending" class="space-y-3">
      <USkeleton v-for="i in 4" :key="i" class="h-24 rounded-lg" />
    </div>

    <div v-else-if="data?.reviews?.length" class="space-y-3">
      <NuxtLink
        v-for="review in data.reviews"
        :key="review.id"
        :to="`/portal/video-reviews/${review.id}`"
        class="block p-4 rounded-lg bg-elevated hover:ring-1 hover:ring-primary/50 transition-all"
        :class="{ 'border-l-4 border-warning': review.status === 'pending' }"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h3 class="font-medium">{{ review.title ?? 'Video review' }}</h3>
              <UBadge :color="(statusColors[review.status] as any) || 'neutral'" variant="subtle" size="xs">
                {{ review.status.replace('_', ' ') }}
              </UBadge>
            </div>
            <div class="flex items-center gap-2 text-xs text-muted mt-1">
              <UBadge color="neutral" variant="subtle" size="xs">{{ review.format }}</UBadge>
              <span>{{ formatDate(review.createdAt) }}</span>
            </div>
          </div>
        </div>
      </NuxtLink>
    </div>

    <UAlert
      v-else
      icon="i-lucide-film"
      color="neutral"
      variant="subtle"
      title="No video reviews yet"
      description="Videos shared with you for review will appear here."
    />
  </div>
</template>
