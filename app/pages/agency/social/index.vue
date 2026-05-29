<script setup lang="ts">
import type { ConnectionHealth } from '~~/server/utils/connectionHealth'

definePageMeta({ layout: 'agency', middleware: ['role-media'] })

const toast = useToast()
const { connections, loading, lastOAuthResult, fetchConnections, connectPlatform, connectWithToken, clearOAuthResult, disconnectPlatform, syncSpend } = useSocialConnections()

const syncing = ref<string | null>(null)
const connecting = ref<string | null>(null)

// Manual token modal state
const tokenModal = ref(false)
const tokenPlatform = ref<string>('meta')
const tokenInput = ref('')
const tokenSubmitting = ref(false)

onMounted(() => {
  fetchConnections()
})

const platforms = [
  { key: 'meta', displayName: 'Meta Ads', icon: 'i-lucide-facebook', bgColor: 'bg-blue-100 dark:bg-blue-900/30', iconColor: 'text-blue-600', description: 'Facebook & Instagram advertising' },
  { key: 'google', displayName: 'Google Ads', icon: 'i-lucide-chrome', bgColor: 'bg-red-100 dark:bg-red-900/30', iconColor: 'text-red-500', description: 'Google search & display ads' },
  { key: 'tiktok', displayName: 'TikTok Ads', icon: 'i-lucide-music', bgColor: 'bg-gray-100 dark:bg-gray-900/30', iconColor: 'text-gray-700', description: 'Short-form video advertising' },
  { key: 'linkedin', displayName: 'LinkedIn Ads', icon: 'i-lucide-linkedin', bgColor: 'bg-blue-50 dark:bg-blue-950', iconColor: 'text-blue-600', description: 'B2B advertising on LinkedIn' },
  { key: 'pinterest', displayName: 'Pinterest Ads', icon: 'i-lucide-pin', bgColor: 'bg-red-50 dark:bg-red-950', iconColor: 'text-red-600', description: 'Visual discovery advertising' },
  { key: 'snapchat', displayName: 'Snapchat Ads', icon: 'i-lucide-ghost', bgColor: 'bg-yellow-50 dark:bg-yellow-950', iconColor: 'text-yellow-600', description: 'Snap and story advertising' },
  { key: 'twitter', displayName: 'X (Twitter) Ads', icon: 'i-lucide-at-sign', bgColor: 'bg-gray-50 dark:bg-gray-950', iconColor: 'text-gray-800', description: 'Promoted posts and trends' },
  { key: 'microsoft_ads', displayName: 'Microsoft Ads', icon: 'i-lucide-search', bgColor: 'bg-cyan-50 dark:bg-cyan-950', iconColor: 'text-cyan-600', description: 'Bing search and display ads' },
]

const SEVERITY_ORDER: ConnectionHealth[] = [
  'error', 'expired', 'expiring_soon', 'never_synced', 'stale_sync', 'healthy',
]

const platformSummaries = computed(() => {
  const map: Record<string, {
    connected: boolean
    accountCount: number
    lastSyncedAt: string | null
    worstHealth: ConnectionHealth | null
    daysUntilExpiry: number | null
  }> = {}
  for (const p of platforms) {
    const conns = connections.value.filter((c: any) => c.platform === p.key && c.status === 'active')
    const lastSync = conns
      .map((c: any) => c.lastSyncedAt)
      .filter(Boolean)
      .sort()
      .pop() || null

    let worstHealth: ConnectionHealth | null = null
    let worstDays: number | null = null
    for (const c of conns) {
      if (!c.health) continue
      if (
        worstHealth === null
        || SEVERITY_ORDER.indexOf(c.health) < SEVERITY_ORDER.indexOf(worstHealth)
      ) {
        worstHealth = c.health
        worstDays = c.daysUntilExpiry ?? null
      }
    }

    map[p.key] = {
      connected: conns.length > 0,
      accountCount: conns.length,
      lastSyncedAt: lastSync,
      worstHealth,
      daysUntilExpiry: worstDays,
    }
  }
  return map
})

const platformDisplayNames: Record<string, string> = {
  meta: 'Meta', google: 'Google', tiktok: 'TikTok', linkedin: 'LinkedIn',
  pinterest: 'Pinterest', snapchat: 'Snapchat', twitter: 'X (Twitter)', microsoft_ads: 'Microsoft',
}

function getPlatformName(key: string) {
  return platformDisplayNames[key] || key
}

async function handleConnect(platform: string) {
  connecting.value = platform
  clearOAuthResult()
  try {
    const result = await connectPlatform(platform as any)
    if (result.success) {
      const name = getPlatformName(platform)
      toast.add({
        title: 'Connected',
        description: `${result.accounts} ${name} ad account${result.accounts !== 1 ? 's' : ''} linked successfully`,
        color: 'success',
      })
    } else if (result.error) {
      toast.add({ title: 'Connection failed', description: result.error, color: 'error' })
    }
  } catch (e: any) {
    const msg = e.data?.statusMessage || e.data?.message || e.message || 'Unknown error'
    const isNotConfigured = msg.includes('not configured')
    const name = getPlatformName(platform)
    toast.add({
      title: isNotConfigured ? 'Not configured' : 'Connection failed',
      description: isNotConfigured
        ? `${name} API credentials are not set. Add them to your environment variables.`
        : msg,
      color: isNotConfigured ? 'warning' : 'error',
    })
  } finally {
    connecting.value = null
  }
}

function handleManualToken(platform: string) {
  tokenPlatform.value = platform
  tokenInput.value = ''
  tokenModal.value = true
}

async function submitManualToken() {
  if (!tokenInput.value.trim()) return
  tokenSubmitting.value = true
  clearOAuthResult()
  try {
    const result = await connectWithToken(tokenPlatform.value as any, tokenInput.value.trim())
    tokenModal.value = false
    if (result.success) {
      const name = getPlatformName(tokenPlatform.value)
      toast.add({
        title: 'Connected',
        description: `${result.accounts} ${name} ad account${result.accounts !== 1 ? 's' : ''} linked`,
        color: 'success',
      })
    } else {
      toast.add({ title: 'Token validation failed', description: result.error || 'Invalid token', color: 'error' })
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  } finally {
    tokenSubmitting.value = false
  }
}

// Disconnect confirmation modal
const disconnectTarget = ref<{ platform: string; displayName: string; accountCount: number } | null>(null)
const disconnecting = ref(false)
const showDisconnectModal = computed({
  get: () => !!disconnectTarget.value,
  set: (val: boolean) => { if (!val) disconnectTarget.value = null },
})

function handleDisconnect(platform: string) {
  const summary = platformSummaries.value[platform]
  if (!summary?.connected) return
  const displayName = getPlatformName(platform)
  disconnectTarget.value = { platform, displayName, accountCount: summary.accountCount }
}

async function confirmDisconnect() {
  if (!disconnectTarget.value) return
  disconnecting.value = true
  try {
    await disconnectPlatform(disconnectTarget.value.platform)
    toast.add({ title: 'Disconnected', description: `All ${disconnectTarget.value.displayName} accounts disconnected`, color: 'success' })
    disconnectTarget.value = null
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  } finally {
    disconnecting.value = false
  }
}

async function handleSync(platform: string) {
  syncing.value = platform
  try {
    await syncSpend(platform as any)
    toast.add({ title: 'Sync started', description: `${getPlatformName(platform)} spend sync is running in the background.`, color: 'success' })
    await fetchConnections()
  } catch (e: any) {
    toast.add({ title: 'Sync failed', description: e.message, color: 'error' })
  } finally {
    syncing.value = null
  }
}

function handleViewAccounts(platform: string) {
  navigateTo(`/agency/social/${platform}`)
}

const graphExplorerUrl = computed(() => {
  const urls: Record<string, string> = {
    meta: 'https://developers.facebook.com/tools/explorer/',
    google: 'https://developers.google.com/oauthplayground/',
    tiktok: 'https://business-api.tiktok.com/portal/docs',
    linkedin: 'https://www.linkedin.com/developers/tools/oauth',
    pinterest: 'https://developers.pinterest.com/tools/api-explorer/',
    snapchat: 'https://businesshelp.snapchat.com/s/article/api-access',
    twitter: 'https://developer.x.com/en/portal/dashboard',
    microsoft_ads: 'https://learn.microsoft.com/en-us/advertising/guides/get-started',
  }
  return urls[tokenPlatform.value] || urls.meta
})

const graphExplorerLabel = computed(() => {
  const labels: Record<string, string> = {
    meta: 'Graph API Explorer',
    google: 'OAuth Playground',
    tiktok: 'TikTok Business API portal',
    linkedin: 'LinkedIn Developer Tools',
    pinterest: 'Pinterest API Explorer',
    snapchat: 'Snapchat Business Help',
    twitter: 'X Developer Portal',
    microsoft_ads: 'Microsoft Ads Docs',
  }
  return labels[tokenPlatform.value] || 'API Documentation'
})
</script>

<template>
  <div class="flex-1 overflow-auto">
    <!-- Header -->
    <div class="border-b border-default bg-elevated/50 px-6 py-5">
      <div class="flex items-center justify-between max-w-6xl mx-auto">
        <div>
          <h1 class="text-xl font-semibold">Ad Platform Connections</h1>
          <p class="text-sm text-muted mt-0.5">Connect your ad accounts to sync spend data for EOM invoicing</p>
        </div>
        <UButton to="/agency/social/spend" variant="soft" icon="i-lucide-bar-chart-3">
          View Spend Dashboard
        </UButton>
      </div>
    </div>

    <div class="p-6 max-w-6xl mx-auto space-y-5">
      <!-- OAuth Result Banner -->
      <div
        v-if="lastOAuthResult"
        class="flex items-start gap-3 rounded-lg border px-4 py-3"
        :class="lastOAuthResult.success
          ? 'border-success/30 bg-success/5'
          : 'border-error/30 bg-error/5'"
      >
        <div class="shrink-0 mt-0.5">
          <UIcon
            :name="lastOAuthResult.success ? 'i-lucide-check-circle-2' : 'i-lucide-x-circle'"
            class="w-5 h-5"
            :class="lastOAuthResult.success ? 'text-success' : 'text-error'"
          />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium">
            {{ lastOAuthResult.success
              ? `${getPlatformName(lastOAuthResult.platform)} connected — ${lastOAuthResult.accounts} account${lastOAuthResult.accounts !== 1 ? 's' : ''} linked`
              : `${getPlatformName(lastOAuthResult.platform)} connection failed`
            }}
          </p>
          <p v-if="!lastOAuthResult.success && lastOAuthResult.error" class="text-xs text-muted mt-0.5">
            {{ lastOAuthResult.error }}
          </p>
          <p v-if="lastOAuthResult.success" class="text-xs text-muted mt-0.5">
            Your ad account data is now available. Sync spend to pull in the latest numbers.
          </p>
        </div>
        <UButton
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          size="xs"
          class="shrink-0"
          @click="clearOAuthResult"
        />
      </div>

      <div v-if="loading" class="flex justify-center py-16">
        <XfLoader size="sm" />
      </div>

      <template v-else>
        <!-- Platform Cards Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SocialPlatformCard
            v-for="p in platforms"
            :key="p.key"
            :platform="p.key"
            :display-name="p.displayName"
            :icon="p.icon"
            :bg-color="p.bgColor"
            :icon-color="p.iconColor"
            :description="p.description"
            :connected="platformSummaries[p.key]?.connected || false"
            :account-count="platformSummaries[p.key]?.accountCount || 0"
            :last-synced-at="platformSummaries[p.key]?.lastSyncedAt || null"
            :worst-health="platformSummaries[p.key]?.worstHealth || null"
            :days-until-expiry="platformSummaries[p.key]?.daysUntilExpiry ?? null"
            :syncing="syncing === p.key"
            :connecting="connecting === p.key"
            :coming-soon="p.comingSoon"
            @connect="handleConnect"
            @disconnect="handleDisconnect"
            @sync="handleSync"
            @reconnect="handleConnect"
            @view-accounts="handleViewAccounts"
            @paste-token="handleManualToken"
          />
        </div>
      </template>
    </div>

    <!-- Disconnect Confirmation Modal -->
    <UModal v-model:open="showDisconnectModal">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-start gap-3">
            <div class="shrink-0 mt-0.5 w-10 h-10 rounded-full bg-error/10 flex items-center justify-center">
              <UIcon name="i-lucide-unplug" class="w-5 h-5 text-error" />
            </div>
            <div>
              <h3 class="text-lg font-semibold">Disconnect {{ disconnectTarget?.displayName }}</h3>
              <p class="text-sm text-muted mt-1">
                This will disconnect
                <strong>{{ disconnectTarget?.accountCount }} account{{ disconnectTarget?.accountCount !== 1 ? 's' : '' }}</strong>.
              </p>
            </div>
          </div>

          <div class="bg-default/50 rounded-lg px-4 py-3 text-sm text-muted flex items-start gap-2">
            <UIcon name="i-lucide-info" class="w-4 h-4 shrink-0 mt-0.5" />
            <span>Historical spend data will be preserved. You can reconnect later to resume syncing.</span>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2">
            <UButton variant="ghost" color="neutral" @click="disconnectTarget = null">
              Cancel
            </UButton>
            <UButton
              color="error"
              :loading="disconnecting"
              icon="i-lucide-unplug"
              @click="confirmDisconnect"
            >
              Disconnect All
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Manual Token Modal -->
    <UModal v-model:open="tokenModal">
      <template #content>
        <div class="p-6 space-y-4">
          <div>
            <h3 class="text-lg font-semibold">Paste Access Token</h3>
            <p class="text-sm text-muted mt-1">
              Get a token from the
              <a :href="graphExplorerUrl" target="_blank" class="text-primary underline">
                {{ graphExplorerLabel }}
              </a>
              and paste it below.
            </p>
          </div>

          <!-- Instructions -->
          <div class="bg-default/50 rounded-lg px-4 py-3 text-xs text-muted space-y-1.5">
            <p class="font-medium text-default">Steps:</p>
            <ol class="list-decimal list-inside space-y-1">
              <li>Go to the <a :href="graphExplorerUrl" target="_blank" class="text-primary underline">{{ graphExplorerLabel }}</a></li>
              <li>Authenticate with your {{ getPlatformName(tokenPlatform) }} account</li>
              <li>Generate an access token with ad read permissions</li>
              <li>Copy the token and paste it below</li>
            </ol>
          </div>

          <div>
            <label class="text-sm font-medium mb-1.5 block">Access Token</label>
            <textarea
              v-model="tokenInput"
              rows="4"
              class="w-full border border-default rounded-lg px-3 py-2 text-sm font-mono bg-default resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Paste your access token here..."
              @keydown.meta.enter="submitManualToken"
            />
          </div>

          <div class="flex items-center justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="tokenModal = false">
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="tokenSubmitting"
              :disabled="!tokenInput.trim()"
              @click="submitManualToken"
            >
              Connect
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
