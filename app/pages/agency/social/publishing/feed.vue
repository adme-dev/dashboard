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

// ── Auto-draft rules (slice 3b) ──
interface FeedRule {
  id: string
  client_id: string
  client_name: string | null
  event_types: string[]
  enabled: boolean
  caption_template: string | null
  drafts_created: number
}
const rules = ref<FeedRule[]>([])
const rulesPending = ref(false)
const showRules = ref(false)
const showRuleModal = ref(false)
const ruleSaving = ref(false)
const ruleForm = ref({ clientId: '', eventNew: true, eventListing: false, captionTemplate: '' })
const toast = useToast()

async function refreshRules() {
  rulesPending.value = true
  try {
    const res = await apiFetch<{ rules: FeedRule[] }>('/api/agency/social/feed-rules')
    rules.value = res.rules
  } catch { rules.value = [] } finally { rulesPending.value = false }
}
onMounted(() => { void refreshRules() })

const ruleClientOptions = computed(() =>
  (data.value?.clients ?? []).map(c => ({ label: c.name, value: c.id })))

async function saveRule() {
  if (!ruleForm.value.clientId) {
    toast.add({ title: 'Pick a client', color: 'warning' })
    return
  }
  const eventTypes = [
    ...(ruleForm.value.eventNew ? ['new'] : []),
    ...(ruleForm.value.eventListing ? ['listing'] : []),
  ]
  if (!eventTypes.length) {
    toast.add({ title: 'Pick at least one event type', color: 'warning' })
    return
  }
  ruleSaving.value = true
  try {
    await apiFetch('/api/agency/social/feed-rules', {
      method: 'POST',
      body: { clientId: ruleForm.value.clientId, eventTypes, captionTemplate: ruleForm.value.captionTemplate || undefined },
    } as any)
    toast.add({ title: 'Rule created', description: 'Matching feed items will be drafted for review (never auto-published).', color: 'success' })
    showRuleModal.value = false
    ruleForm.value = { clientId: '', eventNew: true, eventListing: false, captionTemplate: '' }
    await refreshRules()
  } catch (err: any) {
    toast.add({ title: 'Could not create rule', description: err?.data?.statusMessage, color: 'error' })
  } finally { ruleSaving.value = false }
}

async function toggleRule(rule: FeedRule) {
  try {
    await apiFetch(`/api/agency/social/feed-rules/${rule.id}`, { method: 'PATCH', body: { enabled: !rule.enabled } } as any)
    rule.enabled = !rule.enabled
  } catch (err: any) {
    toast.add({ title: 'Could not update rule', description: err?.data?.statusMessage, color: 'error' })
  }
}

async function deleteRule(rule: FeedRule) {
  try {
    await apiFetch(`/api/agency/social/feed-rules/${rule.id}`, { method: 'DELETE' } as any)
    rules.value = rules.value.filter(r => r.id !== rule.id)
    toast.add({ title: 'Rule deleted', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Could not delete rule', description: err?.data?.statusMessage, color: 'error' })
  }
}

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
          <UButton
            :label="`Auto-draft rules${rules.length ? ` (${rules.length})` : ''}`"
            color="neutral"
            variant="outline"
            icon="i-lucide-wand-sparkles"
            size="sm"
            @click="showRules = !showRules"
          />
          <UButton label="Refresh" color="neutral" icon="i-lucide-refresh-cw" size="sm" :loading="pending" @click="() => refresh(true)" />
        </div>
      </div>

      <!-- Auto-draft rules — matching items become DRAFTS for review, never published. -->
      <UCard v-if="showRules" :ui="{ body: '!p-4' }">
        <div class="flex items-center justify-between mb-3">
          <div>
            <p class="font-medium text-highlighted text-sm">Auto-draft rules</p>
            <p class="text-xs text-muted">Matching feed items are drafted into the publishing queue for review — nothing publishes automatically.</p>
          </div>
          <UButton label="New rule" color="primary" size="xs" icon="i-lucide-plus" @click="showRuleModal = true" />
        </div>
        <div v-if="rulesPending" class="py-4 text-center"><UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-muted" /></div>
        <p v-else-if="!rules.length" class="text-sm text-muted py-2">No rules yet.</p>
        <div v-else class="space-y-2">
          <div v-for="rule in rules" :key="rule.id" class="flex items-center justify-between gap-3 p-2 rounded-lg border border-default">
            <div class="min-w-0">
              <p class="text-sm font-medium truncate">{{ rule.client_name || rule.client_id }}</p>
              <p class="text-xs text-muted">
                {{ rule.event_types.join(', ') }} · {{ rule.drafts_created }} draft{{ Number(rule.drafts_created) === 1 ? '' : 's' }} created
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <USwitch :model-value="rule.enabled" size="sm" @update:model-value="toggleRule(rule)" />
              <UButton color="error" variant="ghost" size="xs" icon="i-lucide-trash" @click="deleteRule(rule)" />
            </div>
          </div>
        </div>
      </UCard>

      <!-- Create rule modal -->
      <UModal v-model:open="showRuleModal">
        <template #content>
          <UCard>
            <template #header>
              <h3 class="font-semibold text-lg">New auto-draft rule</h3>
            </template>
            <div class="space-y-4">
              <UFormField label="Client" required>
                <USelect v-model="ruleForm.clientId" :items="ruleClientOptions" value-key="value" placeholder="Pick a linked client" class="w-full" />
              </UFormField>
              <UFormField label="Draft when" description="Which feed items should create a draft">
                <div class="flex items-center gap-4">
                  <UCheckbox v-model="ruleForm.eventNew" label="New stock" />
                  <UCheckbox v-model="ruleForm.eventListing" label="Any listing" />
                </div>
              </UFormField>
              <UFormField label="Caption template" description="Optional — placeholders: {title} {price} {stock} {url}">
                <UTextarea v-model="ruleForm.captionTemplate" :rows="5" placeholder="{title}&#10;Now {price}&#10;{url}" class="w-full" />
              </UFormField>
            </div>
            <template #footer>
              <div class="flex justify-end gap-2">
                <UButton variant="ghost" color="neutral" @click="showRuleModal = false">Cancel</UButton>
                <UButton color="primary" :loading="ruleSaving" @click="saveRule">Create rule</UButton>
              </div>
            </template>
          </UCard>
        </template>
      </UModal>
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
