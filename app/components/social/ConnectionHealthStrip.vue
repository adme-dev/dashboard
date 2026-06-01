<script setup lang="ts">
import type { ConnectionHealth } from '~~/server/utils/connectionHealth'

interface PlatformSummary {
  total: number
  healthy: number
  expiring_soon: number
  expired: number
  stale_sync: number
  never_synced: number
  error: number
  worst_status: ConnectionHealth
}

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta',
  google: 'Google',
  google_ads: 'Google',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  snapchat: 'Snapchat',
  twitter: 'X',
  microsoft_ads: 'Microsoft',
}

// Cap fetch timeout — health-summary is KV-cached so it's fast in normal cases.
const { data } = await useFetch<Record<string, PlatformSummary>>(
  '/api/agency/social/connections/health-summary',
  { default: () => ({}), timeout: 8_000, lazy: true },
)

// Worst-status counts for the badge label (e.g. "113 expired")
function worstCount(summary: PlatformSummary): number {
  return summary[summary.worst_status] ?? 0
}

const platforms = computed(() =>
  Object.entries(data.value || {})
    .map(([platform, summary]) => ({
      platform,
      label: PLATFORM_LABELS[platform] ?? platform,
      summary,
    }))
    .sort((a, b) => a.label.localeCompare(b.label)),
)
</script>

<template>
  <div v-if="platforms.length" class="flex flex-wrap items-center gap-2 px-1">
    <span class="text-xs font-medium text-muted uppercase tracking-wide mr-1">Connections</span>
    <NuxtLink
      v-for="p in platforms"
      :key="p.platform"
      :to="`/agency/social#${p.platform}`"
      class="no-underline"
    >
      <SocialConnectionHealthBadge
        :status="p.summary.worst_status"
        :label="p.label"
        :count="worstCount(p.summary)"
      />
    </NuxtLink>
  </div>
</template>
