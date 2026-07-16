<script setup lang="ts">
definePageMeta({ layout: 'agency' })

interface FeedItem {
  id: string
  clientId: string
  clientName: string
  feedName: string
  eventType: 'new' | 'listing' | 'price_drop' | 'offer' | 'sold'
  title: string
  price: number | null
  condition: string | null
  stockNumber: string | null
  url: string | null
  imageUrl: string | null
}

const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>

const data = ref<{ flagEnabled: boolean; items: FeedItem[]; clients: Array<{ id: string; name: string }> } | null>(null)
const pending = ref(true)
const error = ref<any>(null)

// Fetch after mount — never SSR-block (see /customers incident 2026-07-16).
async function refresh(force = false) {
  pending.value = true
  error.value = null
  try {
    data.value = await apiFetch(`/api/agency/social/feed-items${force ? '?bust=1' : ''}`)
  } catch (err) {
    error.value = err
  } finally {
    pending.value = false
  }
}
onMounted(() => { void refresh() })

const clientFilter = ref('all')
const clientOptions = computed(() => [
  { label: 'All clients', value: 'all' },
  ...(data.value?.clients ?? []).map(c => ({ label: c.name, value: c.id })),
])

const typeFilter = ref<'all' | 'new' | 'listing'>('all')
const typeOptions = [
  { label: 'All items', value: 'all' },
  { label: 'New stock', value: 'new' },
  { label: 'Listings', value: 'listing' },
]

const filteredItems = computed(() => {
  let list = data.value?.items ?? []
  if (clientFilter.value !== 'all') list = list.filter(i => i.clientId === clientFilter.value)
  if (typeFilter.value !== 'all') list = list.filter(i => i.eventType === typeFilter.value)
  return list
})

const fmtPrice = (v: number | null) =>
  typeof v === 'number' && v > 0
    ? v.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
    : null

function composePrefill(item: FeedItem): string {
  const caption = [
    item.title,
    fmtPrice(item.price) ? `Now ${fmtPrice(item.price)}` : null,
    item.stockNumber ? `Stock #${item.stockNumber}` : null,
    item.url,
  ].filter(Boolean).join('\n')
  return encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify({
    clientId: item.clientId,
    caption,
    imageUrl: item.imageUrl,
    link: item.url,
  })))))
}
</script>

<template>
  <SocialPublishingShell
    title="Auto Feed"
    subtitle="Vehicle feed items across your linked dealer clients — send any item straight to Compose."
  >
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2">
          <USelect v-model="clientFilter" :items="clientOptions" value-key="value" size="sm" class="w-56" icon="i-lucide-building-2" />
          <UTabs v-model="typeFilter" :items="typeOptions" :content="false" size="xs" color="neutral" />
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-muted">{{ filteredItems.length }} item{{ filteredItems.length === 1 ? '' : 's' }}</span>
          <UButton label="Refresh" color="neutral" icon="i-lucide-refresh-cw" size="sm" :loading="pending" @click="() => refresh(true)" />
        </div>
      </div>
      <!-- Flag off / not configured -->
      <UAlert
        v-if="data && !data.flagEnabled"
        icon="i-lucide-plug-zap"
        title="Dealer feeds aren't enabled yet"
        description="Set DEALER_FEEDS_ENABLED and configure the feed provider connection, then link clients to their dealer feeds under Admin."
        color="warning"
        variant="subtle"
      />

      <div v-else-if="pending" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <USkeleton v-for="n in 8" :key="`fs-${n}`" class="h-64" />
      </div>

      <UAlert
        v-else-if="error"
        icon="i-lucide-alert-circle"
        title="Couldn't load feed items"
        :description="error?.data?.statusMessage || 'Please try again shortly.'"
        color="error"
        variant="subtle"
      />

      <UAlert
        v-else-if="!filteredItems.length"
        icon="i-lucide-car"
        title="No feed items"
        description="No items match the current filters, or no clients have active dealer-feed links yet."
        color="neutral"
        variant="subtle"
      />

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <UCard v-for="item in filteredItems" :key="item.id" :ui="{ body: '!p-0' }">
          <div class="aspect-[4/3] bg-elevated overflow-hidden rounded-t-lg">
            <img
              v-if="item.imageUrl"
              :src="item.imageUrl"
              :alt="item.title"
              class="w-full h-full object-cover"
              loading="lazy"
            >
            <div v-else class="w-full h-full flex items-center justify-center">
              <UIcon name="i-lucide-car" class="size-8 text-muted" />
            </div>
          </div>
          <div class="p-4 space-y-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              <UBadge :color="item.eventType === 'new' ? 'success' : 'info'" variant="subtle" size="xs">
                {{ item.eventType === 'new' ? 'New stock' : 'Listing' }}
              </UBadge>
              <UBadge color="neutral" variant="subtle" size="xs">{{ item.clientName }}</UBadge>
            </div>
            <p class="font-medium text-highlighted text-sm truncate" :title="item.title">{{ item.title }}</p>
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold">{{ fmtPrice(item.price) ?? '—' }}</span>
              <span v-if="item.stockNumber" class="text-xs text-muted">#{{ item.stockNumber }}</span>
            </div>
            <div class="flex items-center gap-2 pt-1">
              <UButton
                label="Send to Compose"
                color="primary"
                size="xs"
                icon="i-lucide-pen-line"
                :to="`/agency/social/publishing/compose?prefill=${composePrefill(item)}`"
              />
              <UButton
                v-if="item.url"
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-external-link"
                :to="item.url"
                target="_blank"
              />
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </SocialPublishingShell>
</template>
