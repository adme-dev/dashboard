<!-- app/pages/agency/clients/reconcile.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-media'] })

interface Candidate { contactId: string; name: string; tenantId: string; receivableCents: number; matchedClientId: string | null }
interface ClientRef { id: string; name: string }
interface GroupingItem {
  contactId: string; xeroName: string
  decision: 'existing' | 'new_group'
  clientId?: string; proposedGroupName?: string
  confidence: number; reason: string
}

const toast = useToast()
const loading = ref(true)
const suggesting = ref(false)
const applying = ref(false)
const unresolved = ref<Candidate[]>([])
const clients = ref<ClientRef[]>([])
const lastSyncedAt = ref<string | null>(null)
const grouping = ref<GroupingItem[]>([])

// Per-contact editable decision state. target null = excluded.
const tenantByContact = reactive<Record<string, string>>({})
const nameByContact = reactive<Record<string, string>>({})
const targetClient = reactive<Record<string, string>>({})   // contactId → existing clientId
const newGroupName = reactive<Record<string, string>>({})   // contactId → proposed name
const mode = reactive<Record<string, 'existing' | 'new' | 'skip'>>({}) // per contact

const clientOptions = computed(() => clients.value.map((c) => ({ label: c.name, value: c.id })))

async function load() {
  loading.value = true
  try {
    const res = await $fetch<{ unresolved: Candidate[]; clients: ClientRef[]; lastSyncedAt: string | null }>(
      '/api/agency/clients/reconcile/candidates'
    )
    unresolved.value = res.unresolved
    clients.value = res.clients
    lastSyncedAt.value = res.lastSyncedAt
    for (const c of res.unresolved) {
      tenantByContact[c.contactId] = c.tenantId
      nameByContact[c.contactId] = c.name
      mode[c.contactId] = 'skip'
    }
  } catch (err: any) {
    toast.add({ title: 'Failed to load candidates', description: err.data?.statusMessage || err.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

async function suggest() {
  suggesting.value = true
  try {
    const res = await $fetch<{ ok: boolean; grouping?: GroupingItem[]; error?: string }>(
      '/api/agency/clients/reconcile/suggest',
      { method: 'POST', body: { candidates: unresolved.value.map((c) => ({ contactId: c.contactId, name: c.name })) } }
    )
    if (!res.ok || !res.grouping) {
      toast.add({ title: 'AI grouping unavailable', description: res.error || 'Assign manually below.', color: 'warning' })
      return
    }
    grouping.value = res.grouping
    for (const g of res.grouping) {
      if (g.decision === 'existing' && g.clientId) {
        mode[g.contactId] = 'existing'
        targetClient[g.contactId] = g.clientId
      } else {
        mode[g.contactId] = 'new'
        newGroupName[g.contactId] = g.proposedGroupName || g.xeroName
      }
    }
    toast.add({ title: 'AI grouping ready', description: 'Review and adjust, then create.', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'AI grouping failed', description: err.data?.statusMessage || err.message, color: 'error' })
  } finally {
    suggesting.value = false
  }
}

async function apply() {
  const decisions = unresolved.value
    .filter((c) => mode[c.contactId] !== 'skip')
    .map((c) => {
      const target = mode[c.contactId] === 'existing'
        ? { type: 'existing' as const, clientId: targetClient[c.contactId] }
        : { type: 'new' as const, clientName: (newGroupName[c.contactId] || c.name).trim() }
      return { contactId: c.contactId, tenantId: tenantByContact[c.contactId], xeroName: nameByContact[c.contactId], target }
    })
    .filter((d) => (d.target.type === 'existing' ? d.target.clientId : d.target.clientName))

  if (decisions.length === 0) {
    toast.add({ title: 'Nothing selected', description: 'Pick a target for at least one customer.', color: 'warning' })
    return
  }
  applying.value = true
  try {
    const res = await $fetch<{ created: number; linked: number; skipped: number }>(
      '/api/agency/clients/reconcile/apply', { method: 'POST', body: { decisions } }
    )
    toast.add({ title: 'Reconciled', description: `${res.created} clients created, ${res.linked} contacts linked.`, color: 'success' })
    await load()
    grouping.value = []
  } catch (err: any) {
    toast.add({ title: 'Apply failed', description: err.data?.statusMessage || err.message, color: 'error' })
  } finally {
    applying.value = false
  }
}

function fmtAud(cents: number) { return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}` }

onMounted(load)
</script>

<template>
  <div class="flex-1 overflow-auto">
    <div class="p-6 max-w-5xl mx-auto space-y-6">
      <UButton to="/agency/clients" variant="ghost" icon="i-lucide-arrow-left" size="sm" class="-ml-2">Back to clients</UButton>
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold">Reconcile with Xero</h1>
          <p class="text-sm text-muted">
            Active Xero customers not yet in your client list.
            <span v-if="lastSyncedAt">Xero synced {{ new Date(lastSyncedAt).toLocaleString() }}.</span>
          </p>
        </div>
        <div class="flex gap-2">
          <UButton icon="i-lucide-sparkles" :loading="suggesting" :disabled="!unresolved.length" @click="suggest">Generate AI grouping</UButton>
          <UButton color="primary" icon="i-lucide-check" :loading="applying" :disabled="!unresolved.length" @click="apply">Create approved</UButton>
        </div>
      </div>

      <div v-if="loading" class="py-10 text-center text-muted">Loading…</div>
      <div v-else-if="!unresolved.length" class="py-10 text-center text-muted">Everything reconciles — no unrepresented Xero customers. 🎉</div>

      <div v-else class="space-y-2">
        <div
          v-for="c in unresolved" :key="c.contactId"
          class="flex items-center gap-3 py-2 border-b border-default last:border-0"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ c.name }}</p>
            <p class="text-xs text-muted">{{ fmtAud(c.receivableCents) }} outstanding</p>
          </div>
          <USelect
            v-model="mode[c.contactId]"
            :items="[{ label: 'Skip', value: 'skip' }, { label: 'New group', value: 'new' }, { label: 'Existing client', value: 'existing' }]"
            class="w-36"
          />
          <USelectMenu
            v-if="mode[c.contactId] === 'existing'"
            v-model="targetClient[c.contactId]" :items="clientOptions" value-key="value"
            placeholder="Client…" class="w-56"
          />
          <UInput
            v-else-if="mode[c.contactId] === 'new'"
            v-model="newGroupName[c.contactId]" placeholder="New group name" class="w-56"
          />
          <span v-else class="w-56 text-xs text-muted">—</span>
        </div>
      </div>
    </div>
  </div>
</template>
