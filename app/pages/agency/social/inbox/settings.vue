<script setup lang="ts">
import type { SocialAccount, SocialSavedReply, SocialSlaPolicy } from '~/types'
definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const toast = useToast()
const route = useRoute()
const router = useRouter()
const socialApi = useSocialPublishing()

const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => { const d = clientsData.value as any; return Array.isArray(d) ? d : (d?.clients ?? []) })
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const routeClientId = computed(() => typeof route.query.client === 'string' ? route.query.client : null)
const clientId = ref<string | null>(
  routeClientId.value && clients.value.some(c => c.id === routeClientId.value)
    ? routeClientId.value
    : (clients.value[0]?.id ?? null)
)

watch(clientId, (next) => {
  if (route.query.client === next) return
  router.replace({ query: { ...route.query, client: next || undefined } })
})

const { data: replies, refresh: refreshReplies } = await useFetch<SocialSavedReply[]>('/api/agency/social/inbox/saved-replies', { query: { clientId }, watch: [clientId], default: () => [] })
const { data: policies, refresh: refreshPolicies } = await useFetch<SocialSlaPolicy[]>('/api/agency/social/inbox/sla-policies', { query: { clientId }, watch: [clientId], default: () => [] })

const googleBusinessAccounts = ref<SocialAccount[]>([])
const googleBusinessLoading = ref(false)
const googleBusinessDisconnecting = ref<string | null>(null)
const googleBusinessSyncing = ref(false)
const savingReply = ref(false)
const deletingReply = ref<string | null>(null)
const savingPolicy = ref(false)
const deletingPolicy = ref<string | null>(null)

const currentClientName = computed(() => clients.value.find(c => c.id === clientId.value)?.name || 'Selected client')
const googleBusinessConnectedCount = computed(() => googleBusinessAccounts.value.filter(account => account.is_active && !account.last_error).length)
const googleBusinessIssueCount = computed(() =>
  googleBusinessAccounts.value.filter(account => !account.is_active || account.last_error || isExpired(account.token_expires_at)).length
)
const googleBusinessLastSyncAt = computed(() =>
  googleBusinessAccounts.value
    .map(account => account.last_synced_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
)

function isExpired(value: string | null | undefined) {
  return Boolean(value && Date.parse(value) < Date.now())
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not synced yet'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not synced yet' : date.toLocaleString()
}

function formatTokenExpiry(value: string | null | undefined) {
  if (!value) return 'No expiry recorded'
  return isExpired(value) ? `Expired ${formatDateTime(value)}` : `Expires ${formatDateTime(value)}`
}

function accountState(a: SocialAccount): { label: string; color: string } {
  if (!a.is_active) return { label: 'Disconnected', color: 'error' }
  if (a.last_error) return { label: 'Error', color: 'error' }
  if (isExpired(a.token_expires_at)) return { label: 'Token expired', color: 'warning' }
  return { label: 'Connected', color: 'success' }
}

async function refreshGoogleBusinessAccounts() {
  if (!clientId.value) {
    googleBusinessAccounts.value = []
    return
  }

  const requestedClientId = clientId.value
  googleBusinessLoading.value = true
  try {
    const accounts = await socialApi.listAccounts(requestedClientId)
    if (clientId.value === requestedClientId) {
      googleBusinessAccounts.value = accounts.filter(account => account.platform === 'google-business')
    }
  } catch (e: any) {
    toast.add({
      title: 'Could not load Google Business locations',
      description: e?.data?.statusMessage || e?.message,
      color: 'error'
    })
  } finally {
    if (clientId.value === requestedClientId) googleBusinessLoading.value = false
  }
}

watch(clientId, () => {
  if (import.meta.client) refreshGoogleBusinessAccounts()
})

function connectGoogleBusiness() {
  if (!clientId.value) return
  window.location.href = `/api/agency/social/publishing/accounts/connect/google-business?clientId=${encodeURIComponent(clientId.value)}`
}

async function syncGoogleBusinessReviews() {
  if (!clientId.value) return
  googleBusinessSyncing.value = true
  try {
    const result = await $fetch<{ synced?: number; skipped?: number; timedOut?: boolean }>('/api/agency/social/inbox/accounts/sync', {
      method: 'POST',
      body: { clientId: clientId.value }
    })
    await refreshGoogleBusinessAccounts()
    toast.add({
      title: result.timedOut ? 'Review sync partially completed' : 'Review sync complete',
      description: `${result.synced ?? 0} synced${result.skipped ? `, ${result.skipped} skipped` : ''}`,
      color: result.timedOut ? 'warning' : 'success'
    })
  } catch (e: any) {
    toast.add({ title: 'Review sync failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    googleBusinessSyncing.value = false
  }
}

async function disconnectGoogleBusiness(account: SocialAccount) {
  googleBusinessDisconnecting.value = account.id
  try {
    await socialApi.deleteAccount(account.id)
    toast.add({ title: 'Google Business location disconnected', color: 'success' })
    await refreshGoogleBusinessAccounts()
  } catch (e: any) {
    toast.add({ title: 'Disconnect failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    googleBusinessDisconnecting.value = null
  }
}

const transientConnectQueryKeys = new Set(['social_connected', 'social_error', 'social_select'])

function clearConnectQuery() {
  router.replace({
    query: Object.fromEntries(
      Object.entries(route.query).filter(([key]) => !transientConnectQueryKeys.has(key))
    )
  })
}

const selectOpen = ref(false)
const selectToken = ref('')
type SelectLocation = { id: string; name: string; subtitle?: string | null; status?: 'new' | 'connected' | 'conflict' }
const selectLocations = ref<SelectLocation[]>([])
const selectChosen = ref<string[]>([])
const selecting = ref(false)

function toggleLocation(id: string, on: boolean) {
  selectChosen.value = on ? [...selectChosen.value, id] : selectChosen.value.filter(x => x !== id)
}

async function confirmSelection() {
  selecting.value = true
  try {
    const res = await $fetch<{ connected: string[]; conflicts: string[] }>('/api/agency/social/publishing/accounts/complete', {
      method: 'POST',
      body: { token: selectToken.value, pageIds: selectChosen.value }
    })
    selectOpen.value = false
    if (res.connected.length) toast.add({ title: `Connected: ${res.connected.join(', ')}`, color: 'success' })
    if (res.conflicts.length) toast.add({ title: 'Some locations were skipped', description: res.conflicts.join('; '), color: 'warning' })
    await refreshGoogleBusinessAccounts()
  } catch (e: any) {
    toast.add({ title: 'Could not complete Google Business setup', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    selecting.value = false
  }
}

onMounted(async () => {
  if (route.query.social_connected) {
    toast.add({ title: 'Google Business location connected', color: 'success' })
    await refreshGoogleBusinessAccounts()
    clearConnectQuery()
  } else if (route.query.social_error) {
    toast.add({
      title: 'Google Business connection failed',
      description: String(route.query.social_error).replace(/_/g, ' '),
      color: 'error'
    })
    clearConnectQuery()
  } else if (route.query.social_select) {
    selectToken.value = String(route.query.social_select)
    selectChosen.value = []
    try {
      selectLocations.value = await $fetch('/api/agency/social/publishing/accounts/pending', {
        query: { token: selectToken.value }
      })
      selectChosen.value = selectLocations.value.filter(location => location.status === 'connected').map(location => location.id)
      if (selectLocations.value.length) selectOpen.value = true
      else toast.add({ title: 'No Google Business locations were available', color: 'warning' })
    } catch (e: any) {
      selectLocations.value = []
      toast.add({ title: 'Selection expired - please reconnect', description: e?.data?.statusMessage, color: 'warning' })
    }
    clearConnectQuery()
  } else {
    await refreshGoogleBusinessAccounts()
  }
})

const newReply = reactive({ name: '', content: '', category: '' })
async function addReply() {
  if (!newReply.name.trim() || !newReply.content.trim()) return
  savingReply.value = true
  try {
    await $fetch('/api/agency/social/inbox/saved-replies', { method: 'POST', body: { ...newReply, client_id: clientId.value } })
    newReply.name = ''; newReply.content = ''; newReply.category = ''
    await refreshReplies(); toast.add({ title: 'Saved reply added', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Saved reply failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    savingReply.value = false
  }
}
async function delReply(id: string) {
  deletingReply.value = id
  try {
    await $fetch(`/api/agency/social/inbox/saved-replies/${id}`, { method: 'DELETE' })
    await refreshReplies()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    deletingReply.value = null
  }
}

const ALL_CHANNELS = '__all__'
const newPolicy = reactive({ channel_type: ALL_CHANNELS, target_minutes: 240 })
const CHANNELS = [{ label: 'All channels', value: ALL_CHANNELS }, { label: 'Comments', value: 'comment' }, { label: 'Reviews', value: 'review' }]
async function savePolicy() {
  if (!clientId.value || !newPolicy.target_minutes || newPolicy.target_minutes < 1) return
  savingPolicy.value = true
  try {
    await $fetch('/api/agency/social/inbox/sla-policies', { method: 'POST', body: { client_id: clientId.value, channel_type: newPolicy.channel_type === ALL_CHANNELS ? null : newPolicy.channel_type, target_minutes: newPolicy.target_minutes } })
    await refreshPolicies(); toast.add({ title: 'SLA policy saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'SLA policy failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    savingPolicy.value = false
  }
}
async function delPolicy(id: string) {
  deletingPolicy.value = id
  try {
    await $fetch(`/api/agency/social/inbox/sla-policies/${id}`, { method: 'DELETE' })
    await refreshPolicies()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    deletingPolicy.value = null
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col overflow-y-auto">
    <div class="w-full min-w-0 space-y-6 p-4 sm:p-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-xl font-semibold">Inbox Settings</h1>
          <p class="mt-1 max-w-3xl text-sm text-muted">
            Manage review connections, saved replies, and response targets for {{ currentClientName }}.
          </p>
        </div>
        <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <USelectMenu
            v-model="clientId"
            :items="clientOptions"
            value-key="value"
            placeholder="Select client"
            class="w-full sm:w-64"
          />
          <UButton to="/agency/social/inbox" icon="i-lucide-inbox" variant="subtle">
            Open inbox
          </UButton>
        </div>
      </div>

      <SocialSuiteSectionNav />

      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div class="rounded-lg border border-default p-4">
          <p class="text-xs font-medium uppercase text-muted">Google Business</p>
          <p class="mt-2 text-2xl font-semibold">{{ googleBusinessConnectedCount }}</p>
          <p class="mt-1 text-xs text-muted">connected locations</p>
        </div>
        <div class="rounded-lg border border-default p-4">
          <p class="text-xs font-medium uppercase text-muted">Saved replies</p>
          <p class="mt-2 text-2xl font-semibold">{{ replies?.length || 0 }}</p>
          <p class="mt-1 text-xs text-muted">available templates</p>
        </div>
        <div class="rounded-lg border border-default p-4">
          <p class="text-xs font-medium uppercase text-muted">SLA policies</p>
          <p class="mt-2 text-2xl font-semibold">{{ policies?.length || 0 }}</p>
          <p class="mt-1 text-xs text-muted">response targets</p>
        </div>
      </div>

      <section class="rounded-lg border border-default">
        <div class="flex flex-wrap items-start justify-between gap-4 border-b border-default p-4 sm:p-5">
          <div class="flex min-w-0 gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <UIcon name="i-lucide-store" class="size-5" />
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="font-semibold">Google Business Profile</h2>
                <UBadge v-if="googleBusinessIssueCount" color="warning" variant="subtle" size="sm">
                  {{ googleBusinessIssueCount }} need attention
                </UBadge>
                <UBadge v-else-if="googleBusinessAccounts.length" color="success" variant="subtle" size="sm">
                  Ready for reviews
                </UBadge>
              </div>
              <p class="mt-1 max-w-3xl text-sm text-muted">
                Connect the client locations that should feed Google reviews into the engagement inbox.
              </p>
              <p class="mt-2 text-xs text-muted">
                Last review sync: {{ formatDateTime(googleBusinessLastSyncAt) }}
              </p>
            </div>
          </div>
          <div class="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <UButton
              icon="i-lucide-link"
              :disabled="!clientId"
              @click="connectGoogleBusiness"
            >
              Connect locations
            </UButton>
            <UButton
              icon="i-lucide-refresh-cw"
              variant="subtle"
              :loading="googleBusinessLoading"
              :disabled="!clientId"
              @click="refreshGoogleBusinessAccounts"
            >
              Refresh status
            </UButton>
            <UButton
              icon="i-lucide-download-cloud"
              variant="subtle"
              :loading="googleBusinessSyncing"
              :disabled="!clientId || !googleBusinessAccounts.length"
              @click="syncGoogleBusinessReviews"
            >
              Sync reviews
            </UButton>
          </div>
        </div>

        <div class="p-4 sm:p-5">
          <UAlert
            v-if="!clientId"
            color="warning"
            variant="subtle"
            icon="i-lucide-info"
            title="Select a client"
            description="Choose a client before connecting Google Business Profile locations."
          />

          <div v-else-if="googleBusinessLoading" class="rounded-lg border border-default p-8 text-center text-sm text-muted">
            Loading Google Business locations...
          </div>

          <div v-else-if="!googleBusinessAccounts.length" class="rounded-lg border border-dashed border-default p-8 text-center">
            <UIcon name="i-lucide-store" class="mx-auto size-8 text-muted" />
            <h3 class="mt-3 text-sm font-medium">No Google Business locations connected</h3>
            <p class="mx-auto mt-1 max-w-xl text-sm text-muted">
              Connect functioning Google Business Profile locations here. Once connected, reviews will sync into the inbox and reviews route.
            </p>
            <UButton
              class="mt-4"
              icon="i-lucide-link"
              @click="connectGoogleBusiness"
            >
              Connect Google Business
            </UButton>
          </div>

          <div v-else class="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            <div
              v-for="account in googleBusinessAccounts"
              :key="account.id"
              class="rounded-lg border border-default p-4"
            >
              <div class="flex items-start gap-3">
                <UIcon name="i-lucide-map-pin" class="mt-0.5 size-5 shrink-0 text-muted" />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium" :title="account.account_name || account.platform_account_id">
                    {{ account.account_name || account.platform_account_id }}
                  </div>
                  <div class="mt-0.5 truncate text-xs text-muted">
                    {{ account.platform_account_id }}
                  </div>
                </div>
                <UBadge :color="(accountState(account).color as any)" variant="subtle" size="sm">
                  {{ accountState(account).label }}
                </UBadge>
              </div>
              <div class="mt-4 grid grid-cols-1 gap-2 text-xs text-muted sm:grid-cols-2">
                <div>
                  <span class="block font-medium text-default">Last sync</span>
                  {{ formatDateTime(account.last_synced_at) }}
                </div>
                <div>
                  <span class="block font-medium text-default">Token</span>
                  {{ formatTokenExpiry(account.token_expires_at) }}
                </div>
              </div>
              <div v-if="account.last_error" class="mt-3 rounded-md bg-error/10 p-2 text-xs text-error">
                {{ account.last_error }}
              </div>
              <div class="mt-4 flex justify-end">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="error"
                  icon="i-lucide-unlink"
                  :loading="googleBusinessDisconnecting === account.id"
                  @click="disconnectGoogleBusiness(account)"
                >
                  Disconnect
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section class="rounded-lg border border-default">
          <div class="border-b border-default p-4 sm:p-5">
            <div class="flex items-start gap-3">
              <UIcon name="i-lucide-message-square-text" class="mt-0.5 size-5 text-muted" />
              <div>
                <h2 class="font-semibold">Saved replies</h2>
                <p class="mt-1 text-sm text-muted">Reusable snippets for common comment and review responses.</p>
              </div>
            </div>
          </div>
          <div class="space-y-4 p-4 sm:p-5">
            <div class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(18rem,2fr)_auto] lg:items-end">
              <UFormField label="Name">
                <UInput v-model="newReply.name" placeholder="Thank you" class="w-full" />
              </UFormField>
              <UFormField label="Reply text" help="{{name}} style variables are supported.">
                <UTextarea v-model="newReply.content" placeholder="Thanks {{name}}! We appreciate the review." :rows="2" class="w-full" />
              </UFormField>
              <UButton
                icon="i-lucide-plus"
                :loading="savingReply"
                :disabled="!newReply.name.trim() || !newReply.content.trim()"
                @click="addReply"
              >
                Add reply
              </UButton>
            </div>
            <div v-if="!replies?.length" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
              No saved replies yet.
            </div>
            <div v-else class="space-y-2">
              <div v-for="r in replies" :key="r.id" class="flex items-start justify-between gap-3 rounded-lg border border-default p-3 text-sm">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-medium">{{ r.name }}</span>
                    <UBadge variant="subtle" color="neutral" size="xs">{{ r.usage_count }} uses</UBadge>
                  </div>
                  <p class="mt-1 line-clamp-2 text-muted">{{ r.content }}</p>
                </div>
                <UButton
                  icon="i-lucide-trash-2"
                  size="xs"
                  variant="ghost"
                  color="error"
                  :loading="deletingReply === r.id"
                  @click="delReply(r.id)"
                />
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-lg border border-default">
          <div class="border-b border-default p-4 sm:p-5">
            <div class="flex items-start gap-3">
              <UIcon name="i-lucide-timer" class="mt-0.5 size-5 text-muted" />
              <div>
                <h2 class="font-semibold">SLA policies</h2>
                <p class="mt-1 text-sm text-muted">First-response targets used by inbox health and reporting.</p>
              </div>
            </div>
          </div>
          <div class="space-y-4 p-4 sm:p-5">
            <div class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto] lg:items-end">
              <UFormField label="Channel">
                <USelect v-model="newPolicy.channel_type" :items="CHANNELS" value-key="value" class="w-full" />
              </UFormField>
              <UFormField label="First-response target">
                <div class="flex items-center gap-2">
                  <UInput v-model.number="newPolicy.target_minutes" type="number" min="1" class="w-full" />
                  <span class="shrink-0 text-sm text-muted">minutes</span>
                </div>
              </UFormField>
              <UButton
                icon="i-lucide-save"
                :loading="savingPolicy"
                :disabled="!clientId || !newPolicy.target_minutes || newPolicy.target_minutes < 1"
                @click="savePolicy"
              >
                Save target
              </UButton>
            </div>
            <div v-if="!policies?.length" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
              No SLA policies yet.
            </div>
            <div v-else class="space-y-2">
              <div v-for="p in policies" :key="p.id" class="flex items-center justify-between gap-3 rounded-lg border border-default p-3 text-sm">
                <div class="min-w-0">
                  <div class="font-medium capitalize">{{ p.channel_type || 'All channels' }}</div>
                  <div class="text-xs text-muted">
                    First response within {{ p.target_minutes }} minutes
                    <span v-if="!p.enabled"> - disabled</span>
                  </div>
                </div>
                <UButton
                  icon="i-lucide-trash-2"
                  size="xs"
                  variant="ghost"
                  color="error"
                  :loading="deletingPolicy === p.id"
                  @click="delPolicy(p.id)"
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      <UModal v-model:open="selectOpen">
        <template #content>
          <div class="w-[min(92vw,44rem)] p-6">
            <div class="space-y-4">
              <div>
                <h2 class="text-lg font-semibold">Choose Google Business locations</h2>
                <p class="mt-0.5 text-sm text-muted">Pick the locations that belong to {{ currentClientName }}.</p>
              </div>
              <div class="max-h-96 space-y-2 overflow-auto pr-1">
                <label
                  v-for="location in selectLocations"
                  :key="location.id"
                  class="flex items-center gap-3 rounded-lg border border-default p-3"
                  :class="location.status === 'conflict' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-elevated'"
                >
                  <UCheckbox
                    :model-value="selectChosen.includes(location.id)"
                    :disabled="location.status === 'conflict'"
                    @update:model-value="(value: any) => toggleLocation(location.id, !!value)"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium">{{ location.name }}</div>
                    <div v-if="location.subtitle" class="truncate text-xs text-muted">{{ location.subtitle }}</div>
                  </div>
                  <UBadge v-if="location.status === 'connected'" color="success" variant="subtle" size="sm">Connected</UBadge>
                  <UBadge v-else-if="location.status === 'conflict'" color="warning" variant="subtle" size="sm">Another client</UBadge>
                </label>
              </div>
              <div class="flex justify-end gap-2">
                <UButton color="neutral" variant="ghost" label="Cancel" @click="selectOpen = false" />
                <UButton label="Connect selected" icon="i-lucide-link" :loading="selecting" :disabled="!selectChosen.length" @click="confirmSelection" />
              </div>
            </div>
          </div>
        </template>
      </UModal>
    </div>
  </div>
</template>
