<script setup lang="ts">
import { useSocialPublishing } from '~/composables/useSocialPublishing'
import { useSocialPublishingClient } from '~/composables/useSocialPublishingClient'
import {
  filterSocialPublishingAccounts,
  socialPublishingAccountsForPlatform,
  stripSocialPublishingConnectQuery,
} from '~/utils/socialPublishingAccounts'
import type { SocialAccount } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const api = useSocialPublishing()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()
const googleBusinessPublishingEnabled = computed(() => Boolean(config.public.googleBusinessPublishingEnabled))

const { clientId } = useSocialPublishingClient()

const accounts = ref<SocialAccount[]>([])
const loading = ref(false)
const search = ref('')

const PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'google-business']
const META_PLATFORMS = ['facebook', 'instagram'] // both connect via the same Meta flow

const filteredAccounts = computed(() => filterSocialPublishingAccounts(accounts.value, search.value))
const searching = computed(() => search.value.trim().length > 0)
const platformRows = computed(() =>
  PLATFORMS.map(platform => ({
    platform,
    accounts: socialPublishingAccountsForPlatform(filteredAccounts.value, platform as SocialAccount['platform']),
    total: socialPublishingAccountsForPlatform(accounts.value, platform as SocialAccount['platform']).length,
  })).filter(row => !searching.value || row.accounts.length > 0)
)

async function load() {
  if (!clientId.value) {
    accounts.value = []
    return
  }
  const requestedClientId = clientId.value
  loading.value = true
  try {
    const next = await api.listAccounts(requestedClientId)
    if (clientId.value === requestedClientId) accounts.value = next
  } finally {
    if (clientId.value === requestedClientId) loading.value = false
  }
}
watch(clientId, load, { immediate: true })

function expiryState(a: SocialAccount): { label: string; color: string } {
  if (!a.is_active) return { label: 'Disconnected', color: 'error' }
  if (a.last_error) return { label: 'Error', color: 'error' }
  if (a.token_expires_at && new Date(a.token_expires_at) < new Date()) return { label: 'Token expired', color: 'warning' }
  return { label: 'Connected', color: 'success' }
}

function connect(platform: string) {
  if (!clientId.value) return
  if (META_PLATFORMS.includes(platform)) {
    window.location.href = `/api/agency/social/publishing/accounts/connect/meta?clientId=${encodeURIComponent(clientId.value)}`
  } else if (platform === 'google-business') {
    window.location.href = `/api/agency/social/publishing/accounts/connect/google-business?clientId=${encodeURIComponent(clientId.value)}`
  }
}

async function disconnect(a: SocialAccount) {
  try { await api.deleteAccount(a.id); toast.add({ title: 'Disconnected', color: 'success' }); await load() }
  catch (e: any) { toast.add({ title: 'Failed', description: e?.data?.statusMessage, color: 'error' }) }
}

// --- Account-selection modal (multi-page Meta / multi-location Google connections) ---
const selectOpen = ref(false)
const selectToken = ref('')
type SelectPage = { id: string; name: string; subtitle?: string | null; igUsername?: string; platform?: string; status?: 'new' | 'connected' | 'conflict' }
const selectPages = ref<SelectPage[]>([])
const selectChosen = ref<string[]>([])
const selecting = ref(false)

function togglePage(id: string, on: boolean) {
  selectChosen.value = on ? [...selectChosen.value, id] : selectChosen.value.filter(x => x !== id)
}

async function confirmSelection() {
  selecting.value = true
  try {
    const res = await $fetch<{ connected: string[]; conflicts: string[] }>('/api/agency/social/publishing/accounts/complete', {
      method: 'POST', body: { token: selectToken.value, pageIds: selectChosen.value },
    })
    selectOpen.value = false
    if (res.connected.length) toast.add({ title: `Connected: ${res.connected.join(', ')}`, color: 'success' })
    if (res.conflicts.length) toast.add({ title: 'Some pages were skipped', description: res.conflicts.join('; '), color: 'warning' })
    await load()
  } catch (e: any) {
    toast.add({ title: 'Could not complete', description: e?.data?.statusMessage, color: 'error' })
  } finally { selecting.value = false }
}

function clearConnectQuery() {
  router.replace({ query: stripSocialPublishingConnectQuery(route.query as Record<string, unknown>) })
}

onMounted(async () => {
  if (route.query.social_connected) {
    toast.add({ title: 'Page connected', color: 'success' })
    await load(); clearConnectQuery()
  } else if (route.query.social_error) {
    toast.add({ title: 'Connection failed', description: String(route.query.social_error).replace(/_/g, ' '), color: 'error' })
    clearConnectQuery()
  } else if (route.query.social_select) {
    selectToken.value = String(route.query.social_select)
    selectChosen.value = []
    try {
      selectPages.value = await $fetch('/api/agency/social/publishing/accounts/pending', { query: { token: selectToken.value } })
      // Pre-check pages already connected to this client; conflict pages stay unchecked + disabled.
      selectChosen.value = selectPages.value.filter(p => p.status === 'connected').map(p => p.id)
    } catch { selectPages.value = []; toast.add({ title: 'Selection expired — please reconnect', color: 'warning' }) }
    if (selectPages.value.length) selectOpen.value = true
    clearConnectQuery()
  }
})
</script>

<template>
  <SocialPublishingShell
    title="Connected accounts"
    subtitle="Publishing connections (pages/profiles) for this client."
  >
    <UAlert
      icon="i-lucide-info" color="info" variant="subtle" class="mb-5"
      title="Publishing accounts"
      description="Connect Meta Pages for Facebook and Instagram publishing, or Google Business Profile locations for local posts. Other networks still need per-network app registration."
    />

    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search accounts, IDs, platforms, or errors"
        class="w-full sm:w-96"
      />
      <UBadge v-if="searching" color="neutral" variant="subtle">
        {{ filteredAccounts.length }} of {{ accounts.length }} accounts
      </UBadge>
    </div>

    <div v-if="loading" class="rounded-lg border border-default p-10 text-center text-sm text-muted">
      Loading accounts...
    </div>

    <div v-else-if="searching && !filteredAccounts.length" class="rounded-lg border border-default p-10 text-center text-muted">
      <UIcon name="i-lucide-search-x" class="size-8 mx-auto mb-2 opacity-50" />
      No connected accounts match that search.
    </div>

    <div class="space-y-2">
      <div v-for="row in platformRows" :key="row.platform" class="rounded-lg border border-default p-3 space-y-3">
        <!-- Platform header: icon, name, connected count, connect/add action -->
        <div class="flex items-center gap-3">
          <UIcon :name="`i-lucide-${row.platform === 'google-business' ? 'store' : row.platform === 'tiktok' ? 'music' : row.platform}`" class="size-5 text-muted shrink-0" />
          <div class="flex-1 min-w-0 text-sm font-medium capitalize">
            {{ row.platform.replace('-', ' ') }}
            <span v-if="row.total" class="text-xs text-muted font-normal">
              · {{ searching ? `${row.accounts.length} shown of ${row.total}` : `${row.total} connected` }}
            </span>
          </div>
          <UButton
            v-if="row.platform === 'facebook' && !searching"
            size="xs" variant="subtle" icon="i-lucide-plus" :disabled="!clientId" @click="connect(row.platform)"
          >{{ row.total ? 'Add more' : 'Connect' }}</UButton>
          <template v-else-if="!row.total && !searching">
            <UButton
              v-if="row.platform === 'google-business' && googleBusinessPublishingEnabled"
              size="xs" variant="subtle" icon="i-lucide-plus" :disabled="!clientId" @click="connect(row.platform)"
            >Connect</UButton>
            <UTooltip v-else-if="row.platform === 'google-business'" text="Dormant until Google Business API approval and production secrets are enabled">
              <UButton size="xs" variant="subtle" color="neutral" disabled icon="i-lucide-lock">Dormant</UButton>
            </UTooltip>
            <UTooltip v-else-if="row.platform === 'instagram'" text="Instagram connects automatically with a linked Facebook Page">
              <UButton size="xs" variant="subtle" color="neutral" disabled icon="i-lucide-link-2">Via Facebook</UButton>
            </UTooltip>
            <UTooltip v-else text="Coming soon — needs platform app registration">
              <UButton size="xs" variant="subtle" color="neutral" disabled icon="i-lucide-plus">Connect</UButton>
            </UTooltip>
          </template>
        </div>
        <!-- Connected accounts: responsive wrapping grid of cards (handles many accounts) -->
        <div v-if="row.accounts.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <div
            v-for="a in row.accounts" :key="a.id"
            class="flex items-center gap-2 rounded-md border border-default bg-elevated/30 px-3 py-2 min-w-0"
          >
            <div class="flex-1 min-w-0 text-sm truncate" :title="a.account_name || a.platform_account_id">{{ a.account_name || a.platform_account_id }}</div>
            <UBadge :color="(expiryState(a).color as any)" variant="subtle" size="sm" class="shrink-0">{{ expiryState(a).label }}</UBadge>
            <UButton icon="i-lucide-unlink" size="xs" variant="ghost" color="error" class="shrink-0" @click="disconnect(a)" />
          </div>
        </div>
      </div>
    </div>

    <UModal v-model:open="selectOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <div>
            <h2 class="text-lg font-semibold">Choose accounts to connect</h2>
            <p class="text-sm text-muted mt-0.5">Pick the pages or locations that belong to this client.</p>
          </div>
          <div class="space-y-2 max-h-80 overflow-auto">
            <label
              v-for="pg in selectPages" :key="pg.id"
              class="flex items-center gap-3 rounded-lg border border-default p-3"
              :class="pg.status === 'conflict' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-elevated'"
            >
              <UCheckbox
                :model-value="selectChosen.includes(pg.id)" :disabled="pg.status === 'conflict'"
                @update:model-value="(v:any) => togglePage(pg.id, !!v)"
              />
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium truncate">{{ pg.name }}</div>
                <div v-if="pg.subtitle" class="text-xs text-muted truncate">{{ pg.subtitle }}</div>
              </div>
              <UBadge v-if="pg.status === 'connected'" color="success" variant="subtle" size="sm">Connected</UBadge>
              <UBadge v-else-if="pg.status === 'conflict'" color="warning" variant="subtle" size="sm">Another client</UBadge>
            </label>
          </div>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Cancel" @click="selectOpen = false" />
            <UButton label="Connect selected" icon="i-lucide-link" :loading="selecting" :disabled="!selectChosen.length" @click="confirmSelection" />
          </div>
        </div>
      </template>
    </UModal>
  </SocialPublishingShell>
</template>
