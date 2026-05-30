<!-- app/components/social/Ga4ConnectCard.vue -->
<script setup lang="ts">
interface Ga4Property { accountName: string; propertyId: string; propertyDisplayName: string }
interface Ga4Connection { connectionId: string; accountName: string; properties: Ga4Property[] }
interface Ga4Map { property_id: string; client_id: string; property_display_name: string }
interface ClientOption { label: string; value: string }

const toast = useToast()
const loading = ref(false)
const autoMapping = ref(false)
const connections = ref<Ga4Connection[]>([])
const maps = ref<Ga4Map[]>([])
const clientOptions = ref<ClientOption[]>([])
const selectedClient = reactive<Record<string, string>>({}) // propertyId -> clientId

async function loadProperties() {
  loading.value = true
  try {
    const res = await $fetch<{ connections: Ga4Connection[]; maps: Ga4Map[] }>('/api/agency/social/ga4/properties')
    connections.value = res.connections
    maps.value = res.maps
    for (const m of res.maps) selectedClient[m.property_id] = m.client_id
  } catch (err: any) {
    toast.add({ title: 'Failed to load GA4 properties', description: err.data?.statusMessage || err.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

async function loadClients() {
  // agency_clients list — reuse the existing clients endpoint (returns a bare array of { id, name, ... })
  const res = await $fetch<Array<{ id: string; name: string }>>('/api/agency/clients').catch(() => [])
  clientOptions.value = res.map((c) => ({ label: c.name, value: c.id }))
}

function connect() {
  $fetch<{ url: string }>('/api/agency/social/ga4/connect').then(({ url }) => {
    const popup = window.open(url, 'ga4_oauth', 'width=520,height=640')
    const timer = setInterval(() => {
      if (popup?.closed) { clearInterval(timer); loadProperties() }
    }, 800)
  })
}

async function mapProperty(conn: Ga4Connection, prop: Ga4Property) {
  const clientId = selectedClient[prop.propertyId]
  if (!clientId) return
  try {
    await $fetch('/api/agency/social/ga4/map', {
      method: 'POST',
      body: { connectionId: conn.connectionId, propertyId: prop.propertyId, propertyDisplayName: prop.propertyDisplayName, clientId }
    })
    toast.add({ title: 'Mapped', description: `${prop.propertyDisplayName} → client`, color: 'success' })
    await loadProperties()
  } catch (err: any) {
    toast.add({ title: 'Mapping failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
}

async function autoMap() {
  // Flatten all properties with their owning connection.
  const allProps: Array<{ connectionId: string; prop: Ga4Property }> = []
  for (const conn of connections.value) {
    for (const prop of conn.properties) allProps.push({ connectionId: conn.connectionId, prop })
  }

  const alreadyMapped = new Set(maps.value.map((m) => m.property_id))
  const clientList = clientOptions.value.map((c) => ({ id: c.value, name: c.label }))
  const results = matchPropertiesToClients(
    allProps.map((a) => ({ propertyId: a.prop.propertyId, propertyDisplayName: a.prop.propertyDisplayName })),
    clientList
  )
  const matchById = new Map(results.map((r) => [r.propertyId, r.clientId]))

  const items = allProps
    .filter((a) => !alreadyMapped.has(a.prop.propertyId) && matchById.get(a.prop.propertyId))
    .map((a) => ({
      connectionId: a.connectionId,
      propertyId: a.prop.propertyId,
      propertyDisplayName: a.prop.propertyDisplayName,
      clientId: matchById.get(a.prop.propertyId) as string
    }))

  const manualCount = allProps.length - alreadyMapped.size - items.length

  if (items.length === 0) {
    toast.add({ title: 'No confident matches', description: 'Map the remaining properties manually.', color: 'warning' })
    return
  }

  autoMapping.value = true
  try {
    const res = await $fetch<{ ok: boolean; mapped: number }>('/api/agency/social/ga4/map-bulk', {
      method: 'POST',
      body: { items }
    })
    toast.add({
      title: 'Auto-mapped',
      description: `${res.mapped} mapped, ${manualCount} need manual review.`,
      color: 'success'
    })
    await loadProperties()
  } catch (err: any) {
    toast.add({ title: 'Auto-map failed', description: err.data?.statusMessage || err.message, color: 'error' })
  } finally {
    autoMapping.value = false
  }
}

async function syncNow() {
  await $fetch('/api/agency/social/ga4/sync', { method: 'POST', body: { lookbackDays: 90 } })
  toast.add({ title: 'GA4 sync started', description: 'Pulling the last 90 days in the background.', color: 'success' })
}

onMounted(() => { loadClients(); loadProperties() })
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-line-chart" class="text-primary" />
          <span class="font-semibold">Google Analytics 4</span>
        </div>
        <div class="flex gap-2">
          <UButton size="sm" variant="soft" icon="i-lucide-wand-2" :loading="autoMapping" :disabled="!connections.length" @click="autoMap">
            Auto-map
          </UButton>
          <UButton size="sm" variant="soft" icon="i-lucide-link" @click="connect">Connect Google Analytics</UButton>
          <UButton size="sm" variant="ghost" icon="i-lucide-refresh-cw" :disabled="!connections.length" @click="syncNow">Sync now</UButton>
        </div>
      </div>
    </template>

    <div v-if="loading" class="py-6 text-center text-muted">Loading properties…</div>
    <div v-else-if="!connections.length" class="py-6 text-center text-muted">
      No GA4 account connected yet. Connect a Google account with access to your clients' GA4 properties.
    </div>
    <div v-else class="space-y-6">
      <div v-for="conn in connections" :key="conn.connectionId">
        <p class="text-sm text-muted mb-2">{{ conn.accountName }}</p>
        <div v-if="!conn.properties.length" class="text-sm text-muted">No properties visible to this account.</div>
        <div v-for="prop in conn.properties" :key="prop.propertyId" class="flex items-center gap-3 py-2 border-b border-default last:border-0">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ prop.propertyDisplayName }}</p>
            <p class="text-xs text-muted">{{ prop.accountName }} · {{ prop.propertyId }}</p>
          </div>
          <USelectMenu
            v-model="selectedClient[prop.propertyId]"
            :items="clientOptions"
            value-key="value"
            placeholder="Map to client…"
            class="w-56"
          />
          <UButton size="sm" :disabled="!selectedClient[prop.propertyId]" @click="mapProperty(conn, prop)">Save</UButton>
        </div>
      </div>
    </div>
  </UCard>
</template>
