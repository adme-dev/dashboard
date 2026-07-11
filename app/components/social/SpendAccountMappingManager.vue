<script setup lang="ts">
// Map connected ad accounts to clients. Saving backfills the account's existing
// spend rows immediately (server-side), so per-client reporting + pacing alerts
// light up without a full re-sync.
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'mapped'): void }>()

const toast = useToast()

interface Account {
  id: string
  platform: string
  accountName: string
  accountId: string | null
  clientId: string | null
  spendRows: number
}

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>
const accountsData = ref<{ items: Account[] }>({ items: [] })
const clientsData = ref<Array<{ id: string, name: string }>>([])
const pending = ref(false)

async function refresh() {
  pending.value = true
  try {
    accountsData.value = await apiFetch<{ items: Account[] }>('/api/agency/social/spend/account-mappings')
  } catch {
    accountsData.value = { items: [] }
  } finally {
    pending.value = false
  }
}

async function refreshClients() {
  try {
    clientsData.value = await apiFetch<Array<{ id: string, name: string }>>('/api/agency/clients')
  } catch {
    clientsData.value = []
  }
}

await Promise.all([refresh(), refreshClients()])

const clientItems = computed(() =>
  (clientsData.value ?? []).map(c => ({ label: c.name, value: c.id }))
)

const search = ref('')
const savingId = ref<string | null>(null)
const autoMapping = ref(false)

const accounts = computed(() => accountsData.value?.items ?? [])
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = q
    ? accounts.value.filter(a =>
        a.accountName.toLowerCase().includes(q) ||
        a.platform.toLowerCase().includes(q) ||
        (a.accountId ?? '').toLowerCase().includes(q))
    : accounts.value
  // Group by platform, preserving order.
  const groups = new Map<string, Account[]>()
  for (const a of list) {
    const arr = groups.get(a.platform) ?? []
    arr.push(a)
    groups.set(a.platform, arr)
  }
  return [...groups.entries()].map(([platform, items]) => ({ platform, items }))
})

const mappedCount = computed(() => accounts.value.filter(a => a.clientId).length)

function platformLabel(p: string) {
  if (p === 'meta') return 'Meta'
  if (p === 'google' || p === 'google_ads') return 'Google Ads'
  if (p === 'tiktok') return 'TikTok'
  return p.charAt(0).toUpperCase() + p.slice(1)
}
function platformIcon(p: string) {
  if (p === 'meta') return 'i-lucide-facebook'
  if (p === 'google' || p === 'google_ads') return 'i-lucide-chrome'
  return 'i-lucide-globe'
}

async function save(account: Account, clientId: string | null) {
  savingId.value = account.id
  try {
    const res = await apiFetch<{ backfilled?: number; cleared?: number }>(
      '/api/agency/social/spend/map-account',
      { method: 'POST', body: { connectionId: account.id, clientId } }
    )
    account.clientId = clientId
    const n = res.backfilled ?? res.cleared ?? 0
    toast.add({
      title: clientId ? 'Account mapped' : 'Mapping cleared',
      description: `${account.accountName} — ${n} spend row${n === 1 ? '' : 's'} updated.`,
      color: 'success'
    })
    emit('mapped')
  } catch (e: any) {
    toast.add({ title: 'Could not save', description: e?.data?.statusMessage ?? e.message, color: 'error' })
  } finally {
    savingId.value = null
  }
}

async function autoMapHighConfidence() {
  autoMapping.value = true
  try {
    const res = await apiFetch<{ mapped: number; backfilled: number }>(
      '/api/agency/social/spend/auto-map',
      { method: 'POST' }
    )
    toast.add({
      title: res.mapped > 0 ? 'Auto-map complete' : 'No safe matches found',
      description: res.mapped > 0
        ? `${res.mapped} account${res.mapped === 1 ? '' : 's'} mapped, ${res.backfilled} spend row${res.backfilled === 1 ? '' : 's'} updated.`
        : 'No unmapped spend accounts had a high-confidence client match.',
      color: res.mapped > 0 ? 'success' : 'neutral',
    })
    await refresh()
    emit('mapped')
  } catch (e: any) {
    toast.add({ title: 'Could not auto-map accounts', description: e?.data?.statusMessage ?? e.message, color: 'error' })
  } finally {
    autoMapping.value = false
  }
}
</script>

<template>
  <USlideover v-model:open="open" title="Map ad accounts to clients">
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Assign each connected ad account to a client. Saving updates that account's existing spend
          immediately — powering per-client reporting and budget pacing alerts.
          <span class="text-default font-medium">{{ mappedCount }}/{{ accounts.length }} mapped.</span>
        </p>

        <div class="flex items-center justify-between gap-3 rounded-lg border border-default bg-default/40 px-3 py-2">
          <div class="min-w-0">
            <p class="text-sm font-medium">Auto-map high-confidence matches</p>
            <p class="text-xs text-muted">Matches account names to clients only when the result is unambiguous.</p>
          </div>
          <UButton
            icon="i-lucide-wand-sparkles"
            size="sm"
            variant="soft"
            :loading="autoMapping"
            @click="autoMapHighConfidence"
          >
            Auto-map
          </UButton>
        </div>

        <UInput v-model="search" icon="i-lucide-search" placeholder="Search accounts or platform…" class="w-full" />

        <div v-if="pending" class="py-8 text-center text-sm text-muted">Loading accounts…</div>
        <div v-else-if="accounts.length === 0" class="py-8 text-center text-sm text-muted">No connected ad accounts.</div>

        <div v-for="group in filtered" :key="group.platform" class="space-y-2">
          <div class="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wide pt-2">
            <UIcon :name="platformIcon(group.platform)" class="size-4" />
            {{ platformLabel(group.platform) }}
            <span class="text-muted/60">({{ group.items.length }})</span>
          </div>
          <div
            v-for="account in group.items"
            :key="account.id"
            class="flex items-center gap-3 py-2 border-b border-default/50"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">{{ account.accountName }}</p>
              <p class="text-xs text-muted">{{ account.spendRows }} spend rows</p>
            </div>
            <USelectMenu
              :model-value="account.clientId"
              :items="clientItems"
              value-key="value"
              placeholder="Unmapped"
              searchable
              :loading="savingId === account.id"
              class="w-52 shrink-0"
              @update:model-value="(val: string | null) => save(account, val)"
            />
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
