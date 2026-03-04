<script setup lang="ts">
const {
  metaConnections,
  connectionId,
  hasAdsManagement,
  selectedConnection,
  fetchConnections,
} = useMetaAdUpload()

onMounted(() => {
  fetchConnections()
})

function selectConnection(id: string) {
  connectionId.value = id
}

function scopeColor(conn: any): 'success' | 'warning' {
  const scopes: string[] = conn.scopes || []
  return scopes.includes('ads_management') ? 'success' : 'warning'
}

function scopeLabel(conn: any): string {
  const scopes: string[] = conn.scopes || []
  return scopes.includes('ads_management') ? 'Full Access' : 'Read Only'
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h3 class="text-sm font-semibold mb-1">Select Meta Ad Account</h3>
      <p class="text-xs text-(--ui-text-muted)">
        Choose which Meta Ads account to publish to.
      </p>
    </div>

    <!-- No connections -->
    <div v-if="!metaConnections.length" class="py-8 text-center bg-(--ui-bg) rounded-lg border border-(--ui-border)">
      <UIcon name="i-lucide-unplug" class="w-8 h-8 text-(--ui-text-muted) mx-auto mb-2" />
      <p class="text-sm text-(--ui-text-muted)">No Meta Ads accounts connected</p>
      <p class="text-xs text-(--ui-text-muted) mt-1">Connect an account in Social Settings first.</p>
      <NuxtLink to="/agency/social/settings">
        <UButton variant="outline" size="xs" class="mt-3" icon="i-lucide-external-link">
          Social Settings
        </UButton>
      </NuxtLink>
    </div>

    <!-- Connection list -->
    <div v-else class="space-y-2">
      <button
        v-for="conn in metaConnections"
        :key="conn.id"
        class="w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left"
        :class="connectionId === conn.id
          ? 'border-blue-500 bg-blue-500/5'
          : 'border-(--ui-border) bg-(--ui-bg) hover:bg-(--ui-bg-elevated)'"
        @click="selectConnection(conn.id)"
      >
        <div class="w-8 h-8 rounded-full bg-blue-600/10 flex items-center justify-center shrink-0">
          <UIcon name="i-lucide-facebook" class="w-4 h-4 text-blue-500" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate">{{ conn.accountName || conn.accountId }}</div>
          <div class="text-xs text-(--ui-text-muted)">ID: {{ conn.accountId }}</div>
        </div>
        <UBadge :color="scopeColor(conn)" variant="subtle" size="xs">
          {{ scopeLabel(conn) }}
        </UBadge>
        <UIcon
          v-if="connectionId === conn.id"
          name="i-lucide-check-circle"
          class="w-4 h-4 text-blue-500 shrink-0"
        />
      </button>
    </div>

    <!-- Scope warning -->
    <AdUploadMetaScopeWarning
      v-if="connectionId && !hasAdsManagement"
      :account-name="selectedConnection?.accountName"
    />
  </div>
</template>
