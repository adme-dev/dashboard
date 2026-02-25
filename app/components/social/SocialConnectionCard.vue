<script setup lang="ts">
const props = defineProps<{
  connection?: {
    id: string
    platform: string
    accountId: string
    accountName: string | null
    status: string
    tokenExpiresAt: string | null
    lastSyncedAt?: string | null
    mappedClients?: number
    connectedByName?: string | null
    metadata?: any
    createdAt?: string
  }
  platform: 'meta' | 'google'
  syncing?: boolean
  connecting?: boolean
}>()

const emit = defineEmits<{
  connect: [platform: string]
  disconnect: [connectionId: string]
  sync: [connectionId: string]
  configure: [connectionId: string]
  'paste-token': [platform: string]
}>()

const platformConfig = computed(() => {
  const configs: Record<string, { name: string; icon: string; bgColor: string; iconColor: string; description: string }> = {
    meta: {
      name: 'Meta Ads',
      icon: 'i-lucide-facebook',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600',
      description: 'Facebook & Instagram advertising',
    },
    google: {
      name: 'Google Ads',
      icon: 'i-lucide-chrome',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      iconColor: 'text-red-500',
      description: 'Google search & display ads',
    },
  }
  return configs[props.platform] || configs.meta
})

const statusColor = computed(() => {
  if (!props.connection) return 'neutral'
  switch (props.connection.status) {
    case 'active': return 'success'
    case 'expired': return 'warning'
    case 'disconnected': return 'error'
    default: return 'neutral'
  }
})

const isTokenExpiring = computed(() => {
  if (!props.connection?.tokenExpiresAt) return false
  const expires = new Date(props.connection.tokenExpiresAt)
  const daysUntil = (expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return daysUntil < 7
})

const tokenExpiryText = computed(() => {
  if (!props.connection?.tokenExpiresAt) return null
  const expires = new Date(props.connection.tokenExpiresAt)
  const daysUntil = Math.floor((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (daysUntil < 0) return 'Expired'
  if (daysUntil === 0) return 'Expires today'
  if (daysUntil === 1) return 'Expires tomorrow'
  return `Expires in ${daysUntil}d`
})

const lastSynced = computed(() => {
  if (!props.connection?.lastSyncedAt) return 'Never synced'
  const d = new Date(props.connection.lastSyncedAt)
  const diff = Date.now() - d.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'Synced just now'
  if (hours < 24) return `Synced ${hours}h ago`
  return `Synced ${Math.floor(hours / 24)}d ago`
})

const connectedDate = computed(() => {
  if (!props.connection?.createdAt) return null
  return new Date(props.connection.createdAt).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
})

const businessName = computed(() => {
  if (!props.connection?.metadata) return null
  const meta = typeof props.connection.metadata === 'string'
    ? JSON.parse(props.connection.metadata)
    : props.connection.metadata
  return meta?.businessName || meta?.descriptiveName || null
})

const currency = computed(() => {
  if (!props.connection?.metadata) return null
  const meta = typeof props.connection.metadata === 'string'
    ? JSON.parse(props.connection.metadata)
    : props.connection.metadata
  return meta?.currency || meta?.currencyCode || null
})
</script>

<template>
  <div class="border border-default rounded-xl bg-elevated/50 overflow-hidden">
    <!-- Card Header -->
    <div class="px-5 py-4 flex items-center justify-between border-b border-default">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="platformConfig.bgColor">
          <UIcon :name="platformConfig.icon" class="w-5 h-5" :class="platformConfig.iconColor" />
        </div>
        <div>
          <h3 class="font-semibold text-sm">{{ platformConfig.name }}</h3>
          <p class="text-xs text-muted">{{ platformConfig.description }}</p>
        </div>
      </div>
      <UBadge v-if="connection" :color="statusColor" variant="subtle" size="xs">
        {{ connection.status }}
      </UBadge>
      <UBadge v-else color="neutral" variant="subtle" size="xs">
        Not connected
      </UBadge>
    </div>

    <!-- Card Body -->
    <div class="px-5 py-4">
      <!-- Connected state -->
      <template v-if="connection">
        <!-- Account details grid -->
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div class="bg-default/50 rounded-lg px-3 py-2">
            <p class="text-xs text-muted mb-0.5">Account</p>
            <p class="text-sm font-medium truncate">{{ connection.accountName || connection.accountId }}</p>
          </div>
          <div class="bg-default/50 rounded-lg px-3 py-2">
            <p class="text-xs text-muted mb-0.5">Last Sync</p>
            <p class="text-sm font-medium">{{ lastSynced }}</p>
          </div>
        </div>

        <!-- Extra details row -->
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted mb-4">
          <span v-if="businessName" class="flex items-center gap-1">
            <UIcon name="i-lucide-building-2" class="w-3 h-3 shrink-0" />
            {{ businessName }}
          </span>
          <span v-if="currency" class="flex items-center gap-1">
            <UIcon name="i-lucide-coins" class="w-3 h-3 shrink-0" />
            {{ currency }}
          </span>
          <span v-if="connection.connectedByName" class="flex items-center gap-1">
            <UIcon name="i-lucide-user" class="w-3 h-3 shrink-0" />
            {{ connection.connectedByName }}
          </span>
          <span v-if="connectedDate" class="flex items-center gap-1">
            <UIcon name="i-lucide-calendar" class="w-3 h-3 shrink-0" />
            {{ connectedDate }}
          </span>
          <span v-if="connection.accountId" class="flex items-center gap-1 font-mono">
            <UIcon name="i-lucide-hash" class="w-3 h-3 shrink-0" />
            {{ connection.accountId }}
          </span>
        </div>

        <!-- Token expiry warning -->
        <div v-if="isTokenExpiring" class="flex items-center gap-1.5 text-warning text-xs bg-warning/10 rounded-lg px-3 py-2 mb-4">
          <UIcon name="i-lucide-alert-triangle" class="w-3.5 h-3.5 shrink-0" />
          {{ tokenExpiryText }} — reconnect to refresh
        </div>

        <!-- Token healthy indicator -->
        <div v-else-if="tokenExpiryText && connection.status === 'active'" class="flex items-center gap-1.5 text-xs text-muted mb-4">
          <UIcon name="i-lucide-shield-check" class="w-3.5 h-3.5 text-success shrink-0" />
          Token healthy ({{ tokenExpiryText?.toLowerCase() }})
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-2">
          <UButton size="xs" variant="soft" icon="i-lucide-refresh-cw" :loading="syncing" @click="emit('sync', connection.id)">
            Sync
          </UButton>
          <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-settings" @click="emit('configure', connection.id)">
            Configure
          </UButton>
          <div class="flex-1" />
          <UButton size="xs" variant="ghost" color="error" icon="i-lucide-unplug" @click="emit('disconnect', connection.id)">
            Disconnect
          </UButton>
        </div>
      </template>

      <!-- Not connected state -->
      <template v-else>
        <div class="py-4 text-center">
          <div class="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" :class="platformConfig.bgColor">
            <UIcon :name="platformConfig.icon" class="w-6 h-6" :class="platformConfig.iconColor" />
          </div>
          <p class="text-sm text-muted mb-4">Connect your {{ platformConfig.name }} account to automatically sync ad spend data.</p>
          <div class="flex items-center justify-center gap-2">
            <UButton color="primary" icon="i-lucide-plug" :loading="connecting" @click="emit('connect', platform)">
              Connect {{ platformConfig.name }}
            </UButton>
            <UButton variant="soft" color="neutral" icon="i-lucide-key-round" @click="emit('paste-token', platform)">
              Paste Token
            </UButton>
          </div>
          <p class="text-xs text-muted mt-3">
            OAuth not working? <button class="text-primary underline" @click="emit('paste-token', platform)">Paste an access token</button> from the API Explorer instead.
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
