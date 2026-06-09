<script setup lang="ts">
import { useSocialPublishing } from '~/composables/useSocialPublishing'
import type { SocialAccount } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const api = useSocialPublishing()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()
const googleBusinessPublishingEnabled = computed(() => Boolean(config.public.googleBusinessPublishingEnabled))

const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => {
  const d = clientsData.value as any
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const routeClientId = computed(() => typeof route.query.client === 'string' ? route.query.client : null)
const initialClientId = computed(() => {
  const requested = routeClientId.value
  return clients.value.some(c => c.id === requested) ? requested : (clients.value[0]?.id ?? null)
})
const clientId = ref<string | null>(initialClientId.value)

const accounts = ref<SocialAccount[]>([])
const loading = ref(false)

const PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'google-business']
const META_PLATFORMS = ['facebook', 'instagram'] // both connect via the same Meta flow

async function load() {
  if (!clientId.value) return
  loading.value = true
  try { accounts.value = await api.listAccounts(clientId.value) } finally { loading.value = false }
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

onMounted(async () => {
  if (route.query.social_connected) {
    toast.add({ title: 'Page connected', color: 'success' })
    await load(); router.replace({ query: {} })
  } else if (route.query.social_error) {
    toast.add({ title: 'Connection failed', description: String(route.query.social_error).replace(/_/g, ' '), color: 'error' })
    router.replace({ query: {} })
  } else if (route.query.social_select) {
    selectToken.value = String(route.query.social_select)
    selectChosen.value = []
    try {
      selectPages.value = await $fetch('/api/agency/social/publishing/accounts/pending', { query: { token: selectToken.value } })
      // Pre-check pages already connected to this client; conflict pages stay unchecked + disabled.
      selectChosen.value = selectPages.value.filter(p => p.status === 'connected').map(p => p.id)
    } catch { selectPages.value = []; toast.add({ title: 'Selection expired — please reconnect', color: 'warning' }) }
    if (selectPages.value.length) selectOpen.value = true
    router.replace({ query: {} })
  }
})
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto">
    <div class="flex items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Connected accounts</h1>
        <p class="text-sm text-muted mt-0.5">Publishing connections (pages/profiles) for this client.</p>
      </div>
      <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" label-key="label" icon="i-lucide-building-2" class="w-56" />
    </div>

    <SocialPublishingSectionNav />

    <UAlert
      icon="i-lucide-info" color="info" variant="subtle" class="mb-5"
      title="Publishing accounts"
      description="Connect Meta Pages for Facebook and Instagram publishing, or Google Business Profile locations for local posts. Other networks still need per-network app registration."
    />

    <div class="space-y-2">
      <div v-for="p in PLATFORMS" :key="p" class="flex items-center gap-3 rounded-lg border border-default p-3">
        <UIcon :name="`i-lucide-${p === 'google-business' ? 'store' : p === 'tiktok' ? 'music' : p}`" class="size-5 text-muted" />
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium capitalize">{{ p.replace('-', ' ') }}</div>
          <template v-for="a in accounts.filter(x => x.platform === p)" :key="a.id">
            <div class="text-xs text-muted truncate">{{ a.account_name || a.platform_account_id }}</div>
          </template>
        </div>
        <template v-if="accounts.some(x => x.platform === p)">
          <template v-for="a in accounts.filter(x => x.platform === p)" :key="a.id">
            <UBadge :color="(expiryState(a).color as any)" variant="subtle">{{ expiryState(a).label }}</UBadge>
            <UButton icon="i-lucide-unlink" size="xs" variant="ghost" color="error" @click="disconnect(a)" />
          </template>
        </template>
        <template v-else>
          <UButton
            v-if="p === 'facebook'"
            size="xs" variant="subtle" icon="i-lucide-plus" :disabled="!clientId" @click="connect(p)"
          >Connect</UButton>
          <UButton
            v-else-if="p === 'google-business' && googleBusinessPublishingEnabled"
            size="xs" variant="subtle" icon="i-lucide-plus" :disabled="!clientId" @click="connect(p)"
          >Connect</UButton>
          <UTooltip v-else-if="p === 'google-business'" text="Dormant until Google Business API approval and production secrets are enabled">
            <UButton size="xs" variant="subtle" color="neutral" disabled icon="i-lucide-lock">Dormant</UButton>
          </UTooltip>
          <UTooltip v-else-if="p === 'instagram'" text="Instagram connects automatically with a linked Facebook Page">
            <UButton size="xs" variant="subtle" color="neutral" disabled icon="i-lucide-link-2">Via Facebook</UButton>
          </UTooltip>
          <UTooltip v-else text="Coming soon — needs platform app registration">
            <UButton size="xs" variant="subtle" color="neutral" disabled icon="i-lucide-plus">Connect</UButton>
          </UTooltip>
        </template>
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
  </div>
</template>
