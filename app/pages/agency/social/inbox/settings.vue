<script setup lang="ts">
import type { SocialAccount, SocialSavedReply, SocialSlaPolicy } from '~/types'
definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const toast = useToast()
const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()
const socialApi = useSocialPublishing()
const googleBusinessEnabled = computed(() =>
  config.public.googleBusinessPublishingEnabled === true
  || config.public.googleBusinessPublishingEnabled === 'true'
)

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

function accountState(a: SocialAccount): { label: string; color: string } {
  if (!a.is_active) return { label: 'Disconnected', color: 'error' }
  if (a.last_error) return { label: 'Error', color: 'error' }
  if (a.token_expires_at && new Date(a.token_expires_at) < new Date()) return { label: 'Token expired', color: 'warning' }
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
  await $fetch('/api/agency/social/inbox/saved-replies', { method: 'POST', body: { ...newReply, client_id: clientId.value } })
  newReply.name = ''; newReply.content = ''; newReply.category = ''
  await refreshReplies(); toast.add({ title: 'Saved reply added', color: 'success' })
}
async function delReply(id: string) { await $fetch(`/api/agency/social/inbox/saved-replies/${id}`, { method: 'DELETE' }); await refreshReplies() }

const ALL_CHANNELS = '__all__'
const newPolicy = reactive({ channel_type: ALL_CHANNELS, target_minutes: 240 })
const CHANNELS = [{ label: 'All channels', value: ALL_CHANNELS }, { label: 'Comments', value: 'comment' }, { label: 'Reviews', value: 'review' }]
async function savePolicy() {
  await $fetch('/api/agency/social/inbox/sla-policies', { method: 'POST', body: { client_id: clientId.value, channel_type: newPolicy.channel_type === ALL_CHANNELS ? null : newPolicy.channel_type, target_minutes: newPolicy.target_minutes } })
  await refreshPolicies(); toast.add({ title: 'SLA policy saved', color: 'success' })
}
async function delPolicy(id: string) { await $fetch(`/api/agency/social/inbox/sla-policies/${id}`, { method: 'DELETE' }); await refreshPolicies() }
</script>

<template>
  <div class="p-6 space-y-8 max-w-5xl">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">Inbox Settings</h1>
      <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" placeholder="Select client" class="w-56 max-w-full" />
    </div>

    <SocialSuiteSectionNav />

    <section class="space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="font-medium">Google Business Profile</h2>
          <p class="mt-1 text-sm text-muted">
            Connect locations here for Google reviews, review replies, and engagement inbox syncing.
          </p>
        </div>
        <UButton
          icon="i-lucide-store"
          :disabled="!clientId || !googleBusinessEnabled"
          @click="connectGoogleBusiness"
        >
          Connect Google Business
        </UButton>
      </div>

      <UAlert
        v-if="!googleBusinessEnabled"
        icon="i-lucide-lock"
        color="warning"
        variant="subtle"
        title="Google Business connection is disabled"
        description="Enable the Google Business Profile connection flag and OAuth credentials before connecting locations."
      />

      <div v-if="googleBusinessLoading" class="rounded-lg border border-default p-6 text-center text-sm text-muted">
        Loading Google Business locations...
      </div>

      <div v-else-if="!googleBusinessAccounts.length" class="rounded-lg border border-dashed border-default p-6 text-sm text-muted">
        No Google Business Profile locations are connected for this client.
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          v-for="account in googleBusinessAccounts"
          :key="account.id"
          class="rounded-lg border border-default p-4 space-y-3"
        >
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-store" class="mt-0.5 size-5 text-muted shrink-0" />
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
          <div v-if="account.last_error" class="text-xs text-error">
            {{ account.last_error }}
          </div>
          <div class="flex justify-end">
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
    </section>

    <section class="space-y-3">
      <h2 class="font-medium">Saved replies</h2>
      <div class="grid grid-cols-[1fr_2fr_auto] gap-2 items-end">
        <UFormField label="Name"><UInput v-model="newReply.name" placeholder="Thanks" class="w-full" /></UFormField>
        <UFormField label="Content ( {{variables}} allowed )"><UInput v-model="newReply.content" placeholder="Thanks {{name}}!" class="w-full" /></UFormField>
        <UButton label="Add" :disabled="!newReply.name.trim() || !newReply.content.trim()" @click="addReply" />
      </div>
      <div class="space-y-1">
        <div v-for="r in replies" :key="r.id" class="flex items-center justify-between rounded border border-default p-2 text-sm">
          <div><span class="font-medium">{{ r.name }}</span> <span class="text-muted">— {{ r.content }}</span> <span class="text-xs text-muted">({{ r.usage_count }} uses)</span></div>
          <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" @click="delReply(r.id)" />
        </div>
      </div>
    </section>

    <section class="space-y-3">
      <h2 class="font-medium">SLA policies</h2>
      <div class="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <UFormField label="Channel"><USelect v-model="newPolicy.channel_type" :items="CHANNELS" value-key="value" class="w-full" /></UFormField>
        <UFormField label="First-response target (min)"><UInput v-model.number="newPolicy.target_minutes" type="number" min="1" class="w-full" /></UFormField>
        <UButton label="Save" @click="savePolicy" />
      </div>
      <div class="space-y-1">
        <div v-for="p in policies" :key="p.id" class="flex items-center justify-between rounded border border-default p-2 text-sm">
          <div>{{ p.channel_type || 'all channels' }} — {{ p.target_minutes }}m {{ p.enabled ? '' : '(disabled)' }}</div>
          <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" @click="delPolicy(p.id)" />
        </div>
      </div>
    </section>

    <UModal v-model:open="selectOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <div>
            <h2 class="text-lg font-semibold">Choose Google Business locations</h2>
            <p class="text-sm text-muted mt-0.5">Pick the locations that belong to this client.</p>
          </div>
          <div class="space-y-2 max-h-80 overflow-auto">
            <label
              v-for="location in selectLocations"
              :key="location.id"
              class="flex items-center gap-3 rounded-lg border border-default p-3"
              :class="location.status === 'conflict' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-elevated'"
            >
              <UCheckbox
                :model-value="selectChosen.includes(location.id)"
                :disabled="location.status === 'conflict'"
                @update:model-value="(value: any) => toggleLocation(location.id, !!value)"
              />
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium truncate">{{ location.name }}</div>
                <div v-if="location.subtitle" class="text-xs text-muted truncate">{{ location.subtitle }}</div>
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
      </template>
    </UModal>
  </div>
</template>
