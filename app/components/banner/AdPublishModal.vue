<script setup lang="ts">
import { FORMATS } from '~/utils/banner-constants'

const props = defineProps<{ projectId: string }>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()

// Active tab: google or meta
const activeTab = ref<'google' | 'meta'>('google')

// Fetch published banners
const { data: published } = useFetch<any[]>(
  () => `/api/agency/banner-studio/published/by-project/${props.projectId}`,
  { default: () => [] },
)

// Fetch existing ad publishes
const { data: adPublishes, refresh: refreshPublishes } = useFetch<any[]>(
  () => `/api/agency/banner-studio/ad-publish?projectId=${props.projectId}`,
  { default: () => [] },
)

// Fetch all connected accounts (single request)
const { data: allConnections } = useFetch<any[]>(
  '/api/agency/social/connections',
  { default: () => [] },
)

// Filter by platform
const googleConnections = computed(() =>
  (allConnections.value || []).filter((c: any) => c.platform === 'google'),
)
const metaConnections = computed(() =>
  (allConnections.value || []).filter((c: any) => c.platform === 'meta'),
)

// Form state
const selectedPublishedId = ref('')
const selectedConnectionId = ref('')
const selectedCampaignId = ref('')
const selectedAdGroupId = ref('')
const isPublishing = ref(false)

// Get published banners with live status
const livePublished = computed(() =>
  (published.value || []).filter((p: any) => p.isLive),
)

async function publishToAd() {
  if (!selectedPublishedId.value || !selectedConnectionId.value || !selectedCampaignId.value || !selectedAdGroupId.value) return
  isPublishing.value = true
  try {
    const endpoint = activeTab.value === 'google'
      ? '/api/agency/banner-studio/ad-publish/google'
      : '/api/agency/banner-studio/ad-publish/meta'

    const bodyKey = activeTab.value === 'google' ? 'adGroupId' : 'adSetId'

    await $fetch(endpoint, {
      method: 'POST',
      body: {
        publishedId: selectedPublishedId.value,
        connectionId: selectedConnectionId.value,
        campaignId: selectedCampaignId.value,
        [bodyKey]: selectedAdGroupId.value,
      },
    })

    toast.add({ title: 'Published', description: `Banner sent to ${activeTab.value === 'google' ? 'Google Ads' : 'Meta Ads'}`, color: 'success' })
    selectedPublishedId.value = ''
    selectedCampaignId.value = ''
    selectedAdGroupId.value = ''
    await refreshPublishes()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Failed to publish', color: 'error' })
  } finally {
    isPublishing.value = false
  }
}

const connections = computed(() =>
  activeTab.value === 'google' ? googleConnections.value : metaConnections.value,
)

function platformLabel(p: string): string {
  if (p === 'google_ads') return 'Google Ads'
  if (p === 'meta_ads') return 'Meta Ads'
  return p
}

function statusColor(s: string): string {
  if (s === 'published') return 'success'
  if (s === 'error') return 'error'
  if (s === 'paused') return 'warning'
  return 'neutral'
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ width: 'max-w-2xl' }">
    <template #content>
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold">Publish to Ad Platforms</h2>
          <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="open = false" />
        </div>

        <!-- Platform tabs -->
        <div class="flex gap-1 mb-4 p-1 bg-(--ui-bg) rounded-lg">
          <button
            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors"
            :class="activeTab === 'google' ? 'bg-(--ui-bg-elevated) text-(--ui-text) shadow-sm' : 'text-(--ui-text-muted)'"
            @click="activeTab = 'google'"
          >
            <UIcon name="i-lucide-search" class="w-3.5 h-3.5" />
            Google Ads
          </button>
          <button
            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors"
            :class="activeTab === 'meta' ? 'bg-(--ui-bg-elevated) text-(--ui-text) shadow-sm' : 'text-(--ui-text-muted)'"
            @click="activeTab = 'meta'"
          >
            <UIcon name="i-lucide-facebook" class="w-3.5 h-3.5" />
            Meta Ads
          </button>
        </div>

        <!-- No connections warning -->
        <div v-if="!connections?.length" class="py-6 text-center bg-(--ui-bg) rounded-lg border border-(--ui-border) mb-4">
          <UIcon name="i-lucide-unplug" class="w-8 h-8 text-(--ui-text-muted) mx-auto mb-2" />
          <p class="text-xs text-(--ui-text-muted)">No {{ activeTab === 'google' ? 'Google Ads' : 'Meta Ads' }} accounts connected</p>
          <p class="text-[10px] text-(--ui-text-muted) mt-1">Connect an account in Social &gt; Settings first</p>
        </div>

        <!-- Publish form -->
        <div v-else class="space-y-3 mb-4">
          <!-- Select banner -->
          <div>
            <label class="text-xs text-(--ui-text-muted) block mb-1">Published Banner</label>
            <USelect
              v-model="selectedPublishedId"
              :items="livePublished.map((p: any) => ({
                label: `${FORMATS[p.formatKey]?.name || p.formatKey} (${p.width}x${p.height})`,
                value: p.id,
              }))"
              size="sm"
              placeholder="Select a published banner"
            />
          </div>

          <!-- Select account -->
          <div>
            <label class="text-xs text-(--ui-text-muted) block mb-1">Ad Account</label>
            <USelect
              v-model="selectedConnectionId"
              :items="(connections || []).map((c: any) => ({
                label: c.accountName || c.accountId,
                value: c.id,
              }))"
              size="sm"
              placeholder="Select account"
            />
          </div>

          <!-- Campaign ID (manual input for now) -->
          <div>
            <label class="text-xs text-(--ui-text-muted) block mb-1">Campaign ID</label>
            <UInput v-model="selectedCampaignId" size="sm" placeholder="Enter campaign ID" />
          </div>

          <!-- Ad Group / Ad Set ID -->
          <div>
            <label class="text-xs text-(--ui-text-muted) block mb-1">
              {{ activeTab === 'google' ? 'Ad Group ID' : 'Ad Set ID' }}
            </label>
            <UInput v-model="selectedAdGroupId" size="sm" :placeholder="`Enter ${activeTab === 'google' ? 'ad group' : 'ad set'} ID`" />
          </div>

          <UButton
            :label="`Publish to ${activeTab === 'google' ? 'Google Ads' : 'Meta Ads'}`"
            icon="i-lucide-send"
            block
            size="sm"
            :loading="isPublishing"
            :disabled="!selectedPublishedId || !selectedConnectionId || !selectedCampaignId || !selectedAdGroupId"
            @click="publishToAd"
          />
        </div>

        <!-- Published history -->
        <div v-if="adPublishes?.length" class="border-t border-(--ui-border) pt-4">
          <h3 class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted) mb-3">Publish History</h3>
          <div class="space-y-2">
            <div
              v-for="ap in adPublishes"
              :key="ap.id"
              class="flex items-center gap-3 px-3 py-2 rounded-lg border border-(--ui-border)"
            >
              <div class="flex-1 min-w-0">
                <div class="text-xs font-medium">
                  {{ FORMATS[ap.formatKey]?.name || ap.formatKey }}
                  <span class="text-(--ui-text-muted) font-mono ml-1">{{ ap.width }}x{{ ap.height }}</span>
                </div>
                <div class="text-[10px] text-(--ui-text-muted)">
                  {{ platformLabel(ap.platform) }} · {{ ap.accountName || ap.accountId }}
                  <span v-if="ap.publishedByName"> · {{ ap.publishedByName }}</span>
                </div>
                <div v-if="ap.errorMessage" class="text-[10px] text-red-500 mt-0.5">{{ ap.errorMessage }}</div>
              </div>
              <UBadge :color="statusColor(ap.status)" variant="subtle" size="xs">{{ ap.status }}</UBadge>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
