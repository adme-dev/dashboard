<script setup lang="ts">
import type { ConnectionHealth } from '~~/server/utils/connectionHealth'

const props = defineProps<{
  platform: string
  displayName: string
  icon: string
  bgColor: string
  iconColor: string
  description: string
  connected: boolean
  accountCount: number
  lastSyncedAt: string | null
  worstHealth?: ConnectionHealth | null
  daysUntilExpiry?: number | null
  syncing?: boolean
  connecting?: boolean
  comingSoon?: boolean
}>()

const emit = defineEmits<{
  connect: [platform: string]
  reconnect: [platform: string]
  disconnect: [platform: string]
  sync: [platform: string]
  'view-accounts': [platform: string]
  'paste-token': [platform: string]
}>()

const lastSyncedText = computed(() => {
  if (!props.lastSyncedAt) return 'Never synced'
  const d = new Date(props.lastSyncedAt)
  const diff = Date.now() - d.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'Synced just now'
  if (hours < 24) return `Synced ${hours}h ago`
  return `Synced ${Math.floor(hours / 24)}d ago`
})

const isBroken = computed(() =>
  props.worstHealth === 'expired'
  || props.worstHealth === 'error'
  || props.worstHealth === 'never_synced'
  || props.worstHealth === 'expiring_soon',
)

const expiryLabel = computed(() => {
  const d = props.daysUntilExpiry
  if (d == null) return null
  if (d < 0) return `Expired ${Math.abs(d)}d ago`
  if (d > 30) return null  // far-future expiries are noise
  if (d === 0) return 'Expires today'
  return `Expires in ${d}d`
})
</script>

<template>
  <!-- Coming soon state -->
  <div
    v-if="comingSoon"
    class="border border-dashed border-default rounded-xl p-5 flex items-center gap-4 opacity-50"
  >
    <div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="bgColor">
      <UIcon :name="icon" class="w-5 h-5" :class="iconColor" />
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium">{{ displayName }}</p>
      <p class="text-xs text-muted">{{ description }}</p>
    </div>
    <UBadge color="neutral" variant="subtle" size="xs">Coming soon</UBadge>
  </div>

  <!-- Active platform card -->
  <div
    v-else
    :id="platform"
    class="border border-default rounded-xl bg-elevated/50 overflow-hidden scroll-mt-24"
  >
    <!-- Header -->
    <div class="px-5 py-4 flex items-center justify-between border-b border-default">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="bgColor">
          <UIcon :name="icon" class="w-5 h-5" :class="iconColor" />
        </div>
        <div>
          <h3 class="font-semibold text-sm">{{ displayName }}</h3>
          <p class="text-xs text-muted">{{ description }}</p>
        </div>
      </div>
      <UBadge v-if="connected" color="success" variant="subtle" size="xs">Connected</UBadge>
      <UBadge v-else color="neutral" variant="subtle" size="xs">Not connected</UBadge>
    </div>

    <!-- Body -->
    <div class="px-5 py-4">
      <!-- Connected state -->
      <template v-if="connected">
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div class="bg-default/50 rounded-lg px-3 py-2">
            <p class="text-xs text-muted mb-0.5">Ad Accounts</p>
            <p class="text-sm font-medium">{{ accountCount }} account{{ accountCount !== 1 ? 's' : '' }}</p>
          </div>
          <div class="bg-default/50 rounded-lg px-3 py-2">
            <p class="text-xs text-muted mb-0.5">Last Sync</p>
            <p class="text-sm font-medium">{{ lastSyncedText }}</p>
          </div>
        </div>

        <div
          v-if="worstHealth && worstHealth !== 'healthy'"
          class="flex items-center gap-2 mb-4 flex-wrap"
        >
          <ConnectionHealthBadge :status="worstHealth" :count="accountCount" />
          <span v-if="expiryLabel" class="text-xs text-amber-500">{{ expiryLabel }}</span>
        </div>

        <div class="flex items-center gap-2">
          <UButton size="xs" variant="soft" icon="i-lucide-list" @click="emit('view-accounts', platform)">
            View Accounts
          </UButton>
          <UButton
            v-if="isBroken"
            size="xs"
            variant="solid"
            color="warning"
            icon="i-lucide-plug"
            :loading="connecting"
            @click="emit('reconnect', platform)"
          >
            Reconnect
          </UButton>
          <UButton
            v-else
            size="xs"
            variant="soft"
            color="neutral"
            icon="i-lucide-refresh-cw"
            :loading="syncing"
            @click="emit('sync', platform)"
          >
            Sync
          </UButton>
          <div class="flex-1" />
          <UButton size="xs" variant="ghost" color="error" icon="i-lucide-unplug" @click="emit('disconnect', platform)">
            Disconnect
          </UButton>
        </div>
      </template>

      <!-- Not connected state -->
      <template v-else>
        <div class="py-4 text-center">
          <div class="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" :class="bgColor">
            <UIcon :name="icon" class="w-6 h-6" :class="iconColor" />
          </div>
          <p class="text-sm text-muted mb-4">Connect your {{ displayName }} account to automatically sync ad spend data.</p>
          <div class="flex items-center justify-center gap-2">
            <UButton color="primary" icon="i-lucide-plug" :loading="connecting" @click="emit('connect', platform)">
              Connect {{ displayName }}
            </UButton>
            <UButton variant="soft" color="neutral" icon="i-lucide-key-round" @click="emit('paste-token', platform)">
              Paste Token
            </UButton>
          </div>
          <p class="text-xs text-muted mt-3">
            OAuth not working? <button class="text-primary underline" @click="emit('paste-token', platform)">Paste an access token</button> instead.
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
