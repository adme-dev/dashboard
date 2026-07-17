<script setup lang="ts">
import { useSocialPublishingClient } from '~/composables/useSocialPublishingClient'

definePageMeta({ layout: 'agency' })

interface FeedItem {
  id: string
  clientId: string
  clientName: string
  feedName: string
  eventType: 'new' | 'listing'
  title: string
  price: number | null
  condition: string | null
  stockNumber: string | null
  url: string | null
  imageUrl: string | null
  missingFields: string[]
  readyForCompose: boolean
}

interface FeedReadiness {
  status: 'unknown' | 'empty' | 'ready' | 'partial' | 'blocked'
  matchedTotal: number
  validatedTotal: number
  invalidTotal: number
  issueGroups: Array<{ key: string, label: string, count: number }>
}

interface FeedClientSummary {
  id: string
  name: string
  status: FeedReadiness['status'] | 'error'
  feedName?: string
  total?: number
  readiness?: FeedReadiness
  error?: string
}

interface FeedResponse {
  flagEnabled: boolean
  items: FeedItem[]
  clients: FeedClientSummary[]
}

const { clientId } = useSocialPublishingClient()
const data = ref<FeedResponse | null>(null)
const pending = ref(true)
const error = ref<unknown>(null)
const clientSummary = computed(() => data.value?.clients[0] ?? null)

function apiErrorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback
  const data = 'data' in value && value.data && typeof value.data === 'object' ? value.data : null
  return data && 'statusMessage' in data && typeof data.statusMessage === 'string'
    ? data.statusMessage
    : fallback
}

// Fetch after mount — never SSR-block (see /customers incident 2026-07-16).
async function refresh(force = false) {
  const requestedClientId = clientId.value
  if (!requestedClientId) {
    pending.value = false
    return
  }
  pending.value = true
  error.value = null
  try {
    const response = await $fetch<FeedResponse>('/api/agency/social/feed-items', {
      query: { clientId: requestedClientId, ...(force ? { bust: '1' } : {}) }
    })
    if (clientId.value === requestedClientId) data.value = response
  } catch (err) {
    if (clientId.value === requestedClientId) error.value = err
  } finally {
    if (clientId.value === requestedClientId) pending.value = false
  }
}

const typeFilter = ref<'all' | 'new' | 'listing'>('all')
const typeOptions = [
  { label: 'All items', value: 'all' },
  { label: 'New stock', value: 'new' },
  { label: 'Listings', value: 'listing' }
]

const filteredItems = computed(() => {
  let list = data.value?.items ?? []
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
const rulesError = ref<string | null>(null)
const deleteTarget = ref<FeedRule | null>(null)
const ruleForm = ref({ eventNew: true, eventListing: false, captionTemplate: '' })
const toast = useToast()
const canCreateRule = computed(() => Boolean(
  clientId.value
  && clientSummary.value
  && ['ready', 'partial'].includes(clientSummary.value.status)
))

async function refreshRules() {
  const requestedClientId = clientId.value
  if (!requestedClientId) return
  rulesPending.value = true
  rulesError.value = null
  try {
    const res = await $fetch<{ rules: FeedRule[] }>('/api/agency/social/feed-rules', {
      query: { clientId: requestedClientId }
    })
    if (clientId.value === requestedClientId) rules.value = res.rules
  } catch (err: unknown) {
    if (clientId.value === requestedClientId) {
      rules.value = []
      rulesError.value = apiErrorMessage(err, 'Rules could not be loaded.')
    }
  } finally {
    if (clientId.value === requestedClientId) rulesPending.value = false
  }
}

watch(clientId, () => {
  data.value = null
  rules.value = []
  typeFilter.value = 'all'
  void Promise.all([refresh(), refreshRules()])
}, { immediate: true })

async function saveRule() {
  if (!clientId.value || !canCreateRule.value) {
    toast.add({ title: 'Feed is not ready', description: 'Resolve the source-data issues before enabling automatic drafts.', color: 'warning' })
    return
  }
  const eventTypes = [
    ...(ruleForm.value.eventNew ? ['new'] : []),
    ...(ruleForm.value.eventListing ? ['listing'] : [])
  ]
  if (!eventTypes.length) {
    toast.add({ title: 'Pick at least one event type', color: 'warning' })
    return
  }
  ruleSaving.value = true
  try {
    await $fetch('/api/agency/social/feed-rules', {
      method: 'POST',
      body: { clientId: clientId.value, eventTypes, captionTemplate: ruleForm.value.captionTemplate || undefined }
    })
    toast.add({ title: 'Rule created', description: 'Matching feed items will be drafted for review (never auto-published).', color: 'success' })
    showRuleModal.value = false
    ruleForm.value = { eventNew: true, eventListing: false, captionTemplate: '' }
    await refreshRules()
  } catch (err: unknown) {
    toast.add({ title: 'Could not create rule', description: apiErrorMessage(err, 'Please try again.'), color: 'error' })
  } finally { ruleSaving.value = false }
}

async function toggleRule(rule: FeedRule) {
  try {
    await $fetch(`/api/agency/social/feed-rules/${rule.id}`, { method: 'PATCH', body: { enabled: !rule.enabled } })
    rule.enabled = !rule.enabled
  } catch (err: unknown) {
    toast.add({ title: 'Could not update rule', description: apiErrorMessage(err, 'Please try again.'), color: 'error' })
  }
}

async function confirmDeleteRule() {
  const rule = deleteTarget.value
  if (!rule) return
  try {
    await $fetch(`/api/agency/social/feed-rules/${rule.id}`, { method: 'DELETE' })
    rules.value = rules.value.filter(r => r.id !== rule.id)
    deleteTarget.value = null
    toast.add({ title: 'Rule deleted', color: 'success' })
  } catch (err: unknown) {
    toast.add({ title: 'Could not delete rule', description: apiErrorMessage(err, 'Please try again.'), color: 'error' })
  }
}

function missingLabel(fields: string[]) {
  const labels: Record<string, string> = { url: 'vehicle URL', price: 'price', image: 'image' }
  return fields.map(field => labels[field] || field).join(', ')
}

function composePrefill(item: FeedItem): string {
  const caption = [
    item.title,
    fmtPrice(item.price) ? `Now ${fmtPrice(item.price)}` : null,
    item.stockNumber ? `Stock #${item.stockNumber}` : null,
    item.url
  ].filter(Boolean).join('\n')
  return encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify({
    clientId: item.clientId,
    caption,
    imageUrl: item.imageUrl,
    link: item.url
  })))))
}
</script>

<template>
  <SocialPublishingShell
    title="Auto Feed"
    subtitle="Dealer inventory feed items for the selected client — send publish-ready vehicles to Compose."
  >
    <div class="space-y-4">
      <UAlert
        icon="i-lucide-newspaper"
        title="Looking for industry news?"
        description="Auto Feed is dealer inventory only. Use News Inbox to cherry-pick aggregated articles, optionally rewrite them with AI, and target client accounts and platforms."
        color="info"
        variant="subtle"
      >
        <template #actions>
          <UButton
            label="Browse News Inbox"
            to="/agency/social/publishing/news"
            icon="i-lucide-arrow-right"
            trailing
            color="info"
            variant="soft"
            size="sm"
          />
        </template>
      </UAlert>

      <div class="flex items-center justify-between gap-3 flex-wrap">
        <UTabs
          v-model="typeFilter"
          :items="typeOptions"
          :content="false"
          size="xs"
          color="neutral"
        />
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
          <UButton
            label="Refresh"
            color="neutral"
            icon="i-lucide-refresh-cw"
            size="sm"
            :loading="pending"
            @click="() => refresh(true)"
          />
        </div>
      </div>

      <!-- Auto-draft rules — matching items become DRAFTS for review, never published. -->
      <UCard v-if="showRules" :ui="{ body: '!p-4' }">
        <div class="flex items-center justify-between mb-3">
          <div>
            <p class="font-medium text-highlighted text-sm">
              Auto-draft rules
            </p>
            <p class="text-xs text-muted">
              Matching feed items are drafted into the publishing queue for review — nothing publishes automatically.
            </p>
          </div>
          <UTooltip :text="canCreateRule ? 'Create an auto-draft rule' : 'Resolve feed readiness issues first'">
            <UButton
              label="New rule"
              color="primary"
              size="xs"
              icon="i-lucide-plus"
              :disabled="!canCreateRule"
              @click="showRuleModal = true"
            />
          </UTooltip>
        </div>
        <div v-if="rulesPending" class="py-4 text-center">
          <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-muted" />
        </div>
        <UAlert
          v-else-if="rulesError"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          title="Rules unavailable"
          :description="rulesError"
        />
        <p v-else-if="!rules.length" class="text-sm text-muted py-2">
          No rules yet.
        </p>
        <div v-else class="space-y-2">
          <div v-for="rule in rules" :key="rule.id" class="flex items-center justify-between gap-3 p-2 rounded-lg border border-default">
            <div class="min-w-0">
              <p class="text-sm font-medium truncate">
                {{ rule.client_name || rule.client_id }}
              </p>
              <p class="text-xs text-muted">
                {{ rule.event_types.join(', ') }} · {{ rule.drafts_created }} draft{{ Number(rule.drafts_created) === 1 ? '' : 's' }} created
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <USwitch
                :model-value="rule.enabled"
                size="sm"
                :aria-label="`${rule.enabled ? 'Pause' : 'Enable'} auto-draft rule`"
                @update:model-value="toggleRule(rule)"
              />
              <UButton
                color="error"
                variant="ghost"
                size="xs"
                icon="i-lucide-trash"
                aria-label="Delete auto-draft rule"
                @click="deleteTarget = rule"
              />
            </div>
          </div>
        </div>
      </UCard>

      <!-- Create rule modal -->
      <UModal v-model:open="showRuleModal">
        <template #content>
          <UCard>
            <template #header>
              <h3 class="font-semibold text-lg">
                New auto-draft rule
              </h3>
            </template>
            <div class="space-y-4">
              <UAlert
                color="neutral"
                variant="subtle"
                icon="i-lucide-building-2"
                title="Selected client"
                :description="clientSummary?.name || 'No linked client'"
              />
              <UFormField label="Draft when" description="Which feed items should create a draft">
                <div class="flex items-center gap-4">
                  <UCheckbox v-model="ruleForm.eventNew" label="New stock" />
                  <UCheckbox v-model="ruleForm.eventListing" label="Any listing" />
                </div>
              </UFormField>
              <UFormField label="Caption template" description="Optional — placeholders: {title} {price} {stock} {url}">
                <UTextarea
                  v-model="ruleForm.captionTemplate"
                  :rows="5"
                  placeholder="{title}&#10;Now {price}&#10;{url}"
                  class="w-full"
                />
              </UFormField>
            </div>
            <template #footer>
              <div class="flex justify-end gap-2">
                <UButton variant="ghost" color="neutral" @click="showRuleModal = false">
                  Cancel
                </UButton>
                <UButton color="primary" :loading="ruleSaving" @click="saveRule">
                  Create rule
                </UButton>
              </div>
            </template>
          </UCard>
        </template>
      </UModal>

      <UModal :open="!!deleteTarget" @update:open="(open) => { if (!open) deleteTarget = null }">
        <template #content>
          <div class="p-5 space-y-4">
            <h3 class="font-semibold">
              Delete auto-draft rule?
            </h3>
            <p class="text-sm text-muted">
              Future matching vehicles will stop creating drafts. Existing drafts remain unchanged.
            </p>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="deleteTarget = null">
                Cancel
              </UButton>
              <UButton color="error" icon="i-lucide-trash-2" @click="confirmDeleteRule">
                Delete rule
              </UButton>
            </div>
          </div>
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
        :description="apiErrorMessage(error, 'Please try again shortly.')"
        color="error"
        variant="subtle"
      />

      <UAlert
        v-else-if="!clientId"
        icon="i-lucide-building-2"
        title="Select a client"
        description="Choose a client from the page header to view its dealer inventory."
        color="neutral"
        variant="subtle"
      />

      <UAlert
        v-else-if="!clientSummary"
        icon="i-lucide-unlink"
        title="No active dealer feed link"
        description="Link this client to its dealer inventory provider in Admin before using Auto Feed."
        color="warning"
        variant="subtle"
      />

      <UAlert
        v-else-if="clientSummary?.status === 'error'"
        icon="i-lucide-triangle-alert"
        title="Inventory provider unavailable"
        :description="clientSummary.error"
        color="error"
        variant="subtle"
      />

      <UAlert
        v-if="clientSummary?.status === 'blocked'"
        icon="i-lucide-shield-alert"
        title="Source data is not ready for publishing"
        :description="`${clientSummary.readiness?.validatedTotal ?? 0} of ${clientSummary.readiness?.matchedTotal ?? clientSummary.total ?? 0} vehicles passed feed validation. Fix the source fields listed on each card before composing or enabling auto-drafts.`"
        color="warning"
        variant="subtle"
      />

      <UAlert
        v-if="clientSummary && clientSummary.status !== 'error' && !filteredItems.length"
        icon="i-lucide-car"
        title="No vehicles match this filter"
        description="Try another inventory tab or refresh the selected client's feed."
        color="neutral"
        variant="subtle"
      />

      <div v-if="filteredItems.length" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
              <UBadge color="neutral" variant="subtle" size="xs">
                {{ item.clientName }}
              </UBadge>
              <UBadge
                v-if="!item.readyForCompose"
                color="warning"
                variant="subtle"
                size="xs"
              >
                Source incomplete
              </UBadge>
            </div>
            <p class="font-medium text-highlighted text-sm truncate" :title="item.title">
              {{ item.title }}
            </p>
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold">{{ fmtPrice(item.price) ?? '—' }}</span>
              <span v-if="item.stockNumber" class="text-xs text-muted">#{{ item.stockNumber }}</span>
            </div>
            <p v-if="!item.readyForCompose" class="text-xs text-warning">
              Missing {{ missingLabel(item.missingFields) }}. Add the missing source data before composing.
            </p>
            <div class="flex items-center gap-2 pt-1">
              <UTooltip :text="item.readyForCompose ? 'Open this vehicle in Compose' : 'Add the missing source data before composing'">
                <UButton
                  label="Send to Compose"
                  color="primary"
                  size="xs"
                  icon="i-lucide-pen-line"
                  :disabled="!item.readyForCompose"
                  :to="item.readyForCompose ? `/agency/social/publishing/compose?prefill=${composePrefill(item)}` : undefined"
                />
              </UTooltip>
              <UButton
                v-if="item.url"
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-external-link"
                :to="item.url"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open vehicle listing"
              />
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </SocialPublishingShell>
</template>
