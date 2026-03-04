<script setup lang="ts">
const {
  connectionId,
  campaignId,
  campaignName,
  adSetId,
  adSetName,
  campaigns,
  adSets,
  fetchCampaigns,
  fetchAdSets,
} = useMetaAdUpload()

const campaignSearch = ref('')
const adSetSearch = ref('')
const isLoadingCampaigns = ref(false)
const isLoadingAdSets = ref(false)

onMounted(async () => {
  isLoadingCampaigns.value = true
  await fetchCampaigns()
  isLoadingCampaigns.value = false
})

const filteredCampaigns = computed(() => {
  const q = campaignSearch.value.toLowerCase()
  if (!q) return campaigns.value
  return campaigns.value.filter((c: any) =>
    (c.name || '').toLowerCase().includes(q) || (c.id || '').includes(q),
  )
})

const filteredAdSets = computed(() => {
  const q = adSetSearch.value.toLowerCase()
  if (!q) return adSets.value
  return adSets.value.filter((a: any) =>
    (a.name || '').toLowerCase().includes(q) || (a.id || '').includes(q),
  )
})

async function selectCampaign(c: any) {
  campaignId.value = c.id
  campaignName.value = c.name || c.id
  adSetId.value = ''
  adSetName.value = ''
  adSets.value = []
  isLoadingAdSets.value = true
  await fetchAdSets()
  isLoadingAdSets.value = false
}

function selectAdSet(a: any) {
  adSetId.value = a.id
  adSetName.value = a.name || a.id
}

function statusColor(status: string): 'success' | 'warning' | 'neutral' {
  if (status === 'ACTIVE') return 'success'
  if (status === 'PAUSED') return 'warning'
  return 'neutral'
}
</script>

<template>
  <div class="space-y-4">
    <!-- Campaign section -->
    <div>
      <h3 class="text-sm font-semibold mb-1">Select Campaign</h3>
      <p class="text-xs text-(--ui-text-muted) mb-3">
        Choose the campaign to place your ads in.
      </p>
      <UInput
        v-model="campaignSearch"
        placeholder="Search campaigns..."
        icon="i-lucide-search"
        size="sm"
        class="mb-2"
      />

      <div v-if="isLoadingCampaigns" class="py-6 text-center">
        <UIcon name="i-lucide-loader-2" class="w-5 h-5 text-(--ui-text-muted) animate-spin mx-auto" />
        <p class="text-xs text-(--ui-text-muted) mt-2">Loading campaigns...</p>
      </div>

      <div v-else-if="!campaigns.length" class="py-6 text-center bg-(--ui-bg) rounded-lg border border-(--ui-border)">
        <p class="text-xs text-(--ui-text-muted)">No campaigns found for this account</p>
      </div>

      <div v-else class="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-(--ui-border) p-1">
        <button
          v-for="c in filteredCampaigns"
          :key="c.id"
          class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-xs transition-colors"
          :class="campaignId === c.id
            ? 'bg-blue-500/10 text-blue-500'
            : 'hover:bg-(--ui-bg-elevated)'"
          @click="selectCampaign(c)"
        >
          <div class="flex-1 min-w-0">
            <span class="font-medium truncate block">{{ c.name || c.id }}</span>
          </div>
          <UBadge :color="statusColor(c.status || c.effective_status)" variant="subtle" size="xs">
            {{ c.status || c.effective_status || 'Unknown' }}
          </UBadge>
        </button>
      </div>
    </div>

    <!-- Ad Set section (only after campaign selected) -->
    <div v-if="campaignId">
      <h3 class="text-sm font-semibold mb-1">Select Ad Set</h3>
      <p class="text-xs text-(--ui-text-muted) mb-3">
        Choose the ad set within <span class="font-medium">{{ campaignName }}</span>.
      </p>
      <UInput
        v-model="adSetSearch"
        placeholder="Search ad sets..."
        icon="i-lucide-search"
        size="sm"
        class="mb-2"
      />

      <div v-if="isLoadingAdSets" class="py-6 text-center">
        <UIcon name="i-lucide-loader-2" class="w-5 h-5 text-(--ui-text-muted) animate-spin mx-auto" />
        <p class="text-xs text-(--ui-text-muted) mt-2">Loading ad sets...</p>
      </div>

      <div v-else-if="!adSets.length" class="py-6 text-center bg-(--ui-bg) rounded-lg border border-(--ui-border)">
        <p class="text-xs text-(--ui-text-muted)">No ad sets found for this campaign</p>
      </div>

      <div v-else class="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-(--ui-border) p-1">
        <button
          v-for="a in filteredAdSets"
          :key="a.id"
          class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-xs transition-colors"
          :class="adSetId === a.id
            ? 'bg-blue-500/10 text-blue-500'
            : 'hover:bg-(--ui-bg-elevated)'"
          @click="selectAdSet(a)"
        >
          <div class="flex-1 min-w-0">
            <span class="font-medium truncate block">{{ a.name || a.id }}</span>
          </div>
          <UBadge :color="statusColor(a.status || a.effective_status)" variant="subtle" size="xs">
            {{ a.status || a.effective_status || 'Unknown' }}
          </UBadge>
        </button>
      </div>
    </div>
  </div>
</template>
