<script setup lang="ts">
import { useSocialPublishing } from '~/composables/useSocialPublishing'
import type { SocialAccount } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const api = useSocialPublishing()
const toast = useToast()

const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => {
  const d = clientsData.value as any
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)

const accounts = ref<SocialAccount[]>([])
const loading = ref(false)

const PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'google-business']

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

async function disconnect(a: SocialAccount) {
  try { await api.deleteAccount(a.id); toast.add({ title: 'Disconnected', color: 'success' }); await load() }
  catch (e: any) { toast.add({ title: 'Failed', description: e?.data?.statusMessage, color: 'error' }) }
}
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

    <UAlert
      icon="i-lucide-info" color="info" variant="subtle" class="mb-5"
      title="OAuth connect is operator-activated"
      description="Connecting a network requires per-network app credentials + a registered redirect URI. See the release runbook to enable it."
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
        <UButton v-else size="xs" variant="subtle" color="neutral" disabled icon="i-lucide-plus">Connect</UButton>
      </div>
    </div>
  </div>
</template>
