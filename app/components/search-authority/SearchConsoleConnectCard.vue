<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

interface SearchAuthoritySite {
  id: string
  clientId: string
  clientName: string
  canonicalHostname: string
  contentHostname: string | null
  status: string
}

interface SearchConsoleProperty {
  propertyUri: string
  permissionLevel: 'siteOwner' | 'siteFullUser' | 'siteRestrictedUser' | 'siteUnverifiedUser'
  propertyType: 'domain' | 'url_prefix'
}

interface SearchConsoleConnection {
  connectionId: string
  email: string
  status: 'active' | 'degraded'
  lastCheckedAt: string | null
  lastSuccessAt: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  properties: SearchConsoleProperty[]
}

interface SearchConsoleMap {
  id: string
  connectionId: string
  propertyUri: string
  permissionLevel: SearchConsoleProperty['permissionLevel']
  propertyType: SearchConsoleProperty['propertyType']
  status: string
}

interface PropertyOption extends SearchConsoleProperty {
  connectionId: string
  label: string
  value: string
}

const props = defineProps<{
  sites: SearchAuthoritySite[]
}>()

const toast = useToast()
const selectedClientId = ref<string | null>(
  props.sites.length === 1 ? props.sites[0]!.clientId : null
)
const selectedPropertyKey = ref<string | null>(null)
const connections = ref<SearchConsoleConnection[]>([])
const maps = ref<SearchConsoleMap[]>([])
const loading = ref(false)
const connecting = ref(false)
const mapping = ref(false)
let popupTimer: ReturnType<typeof setInterval> | null = null

const siteOptions = computed(() => props.sites.map(site => ({
  label: `${site.clientName} · ${site.canonicalHostname}`,
  value: site.clientId
})))
const selectedSite = computed(() => props.sites.find(
  site => site.clientId === selectedClientId.value
))
const verifiedProperties = computed<PropertyOption[]>(() => (
  connections.value.flatMap(connection => connection.properties
    .filter(property => property.permissionLevel !== 'siteUnverifiedUser')
    .map(property => ({
      ...property,
      connectionId: connection.connectionId,
      label: `${property.propertyUri} · ${permissionLabel(property.permissionLevel)}`,
      value: propertyKey(connection.connectionId, property.propertyUri)
    })))
))
const selectedProperty = computed(() => verifiedProperties.value.find(
  property => property.value === selectedPropertyKey.value
))
const hasConnections = computed(() => connections.value.length > 0)
const hasDegradedConnection = computed(() => connections.value.some(
  connection => connection.status === 'degraded'
))

watch(() => props.sites.map(site => site.clientId).join('|'), () => {
  if (selectedClientId.value && props.sites.some(site => (
    site.clientId === selectedClientId.value
  ))) return
  selectedClientId.value = props.sites.length === 1 ? props.sites[0]!.clientId : null
})

watch(selectedClientId, () => {
  void loadProperties()
}, { immediate: true })

function propertyKey(connectionId: string, propertyUri: string): string {
  return `${connectionId}:${encodeURIComponent(propertyUri)}`
}

function permissionLabel(permission: SearchConsoleProperty['permissionLevel']): string {
  const labels = {
    siteOwner: 'Owner',
    siteFullUser: 'Full user',
    siteRestrictedUser: 'Restricted',
    siteUnverifiedUser: 'Unverified'
  }
  return labels[permission]
}

function mappedStatus(connectionId: string, propertyUri: string): string | null {
  return maps.value.find(map => (
    map.connectionId === connectionId
    && map.propertyUri === propertyUri
    && map.status !== 'disconnected'
  ))?.status || null
}

function checkedLabel(connection: SearchConsoleConnection): string {
  const timestamp = connection.lastSuccessAt || connection.lastCheckedAt
  if (!timestamp) return 'Not checked yet'
  return `Last verified ${new Date(timestamp).toLocaleString('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })}`
}

function errorMessage(error: unknown): string {
  const candidate = error as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  } | null
  return candidate?.data?.statusMessage
    || candidate?.statusMessage
    || candidate?.message
    || 'Google Search Console could not be reached'
}

function stopPopupPolling() {
  if (popupTimer) clearInterval(popupTimer)
  popupTimer = null
}

async function loadProperties() {
  if (!selectedClientId.value) {
    connections.value = []
    maps.value = []
    selectedPropertyKey.value = null
    return
  }
  loading.value = true

  try {
    const response = await $fetch<{
      connections: SearchConsoleConnection[]
      maps: SearchConsoleMap[]
    }>(
      `/api/agency/search-authority/google/properties?clientId=${encodeURIComponent(selectedClientId.value)}`
    )
    connections.value = response.connections
    maps.value = response.maps
    const currentMap = response.maps.find(map => (
      map.status === 'active' || map.status === 'restricted'
    ))
    selectedPropertyKey.value = currentMap
      ? propertyKey(currentMap.connectionId, currentMap.propertyUri)
      : null
  } catch (error: unknown) {
    connections.value = []
    maps.value = []
    selectedPropertyKey.value = null
    toast.add({
      title: 'Search Console unavailable',
      description: errorMessage(error),
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

async function connectGoogle() {
  if (!selectedClientId.value) return
  connecting.value = true

  try {
    const response = await $fetch<{ url: string }>(
      `/api/agency/search-authority/google/connect?clientId=${encodeURIComponent(selectedClientId.value)}`
    )
    const popup = window.open(
      response.url,
      'search_console_oauth',
      'width=560,height=720,menubar=no,toolbar=no'
    )
    if (!popup) {
      toast.add({
        title: 'Popup blocked',
        description: 'Allow popups for XeroFlow, then connect Search Console again.',
        color: 'warning'
      })
      return
    }

    stopPopupPolling()
    popupTimer = setInterval(() => {
      if (!popup.closed) return
      stopPopupPolling()
      void loadProperties()
    }, 750)
  } catch (error: unknown) {
    toast.add({
      title: 'Connection failed',
      description: errorMessage(error),
      color: 'error'
    })
  } finally {
    connecting.value = false
  }
}

async function mapProperty() {
  const property = selectedProperty.value
  if (!selectedClientId.value || !property) return
  mapping.value = true

  try {
    await $fetch('/api/agency/search-authority/google/map', {
      method: 'POST',
      body: {
        clientId: selectedClientId.value,
        connectionId: property.connectionId,
        propertyUri: property.propertyUri,
        permissionLevel: property.permissionLevel
      }
    })
    toast.add({
      title: 'Property mapped',
      description: `${property.propertyUri} is now the evidence source for ${selectedSite.value?.clientName}.`,
      color: 'success'
    })
    await loadProperties()
  } catch (error: unknown) {
    toast.add({
      title: 'Mapping failed',
      description: errorMessage(error),
      color: 'error'
    })
  } finally {
    mapping.value = false
  }
}

onBeforeUnmount(stopPopupPolling)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="flex min-w-0 items-start gap-3">
          <div class="rounded-lg bg-primary/10 p-2 text-primary">
            <UIcon name="i-lucide-chart-no-axes-combined" class="size-5" />
          </div>
          <div>
            <h2 class="font-semibold text-highlighted">
              Google Search Console
            </h2>
            <p class="mt-1 text-sm text-muted">
              Connect read-only search evidence and choose the verified property for this site.
            </p>
          </div>
        </div>
        <UButton
          label="Connect Google"
          icon="i-lucide-link"
          color="neutral"
          variant="soft"
          :loading="connecting"
          :disabled="!selectedClientId"
          data-testid="connect-search-console"
          @click="connectGoogle"
        />
      </div>
    </template>

    <UAlert
      v-if="sites.length === 0"
      title="Configure a site first"
      description="Search Console can only be connected after a client website has passed the readiness step."
      icon="i-lucide-circle-dashed"
      color="neutral"
      variant="subtle"
    />

    <div v-else class="@container space-y-5">
      <UAlert
        title="Provider-reported evidence"
        description="Search Console data can be delayed or provisional. XeroFlow preserves Google's reported completeness and permission state instead of presenting estimates as final."
        icon="i-lucide-info"
        color="primary"
        variant="subtle"
      />

      <UFormField
        label="Configured site"
        help="The selected client controls which Search Console connection and property maps are visible."
      >
        <USelectMenu
          v-model="selectedClientId"
          :items="siteOptions"
          value-key="value"
          placeholder="Choose a configured site"
          class="w-full"
          data-testid="search-console-site"
        />
      </UFormField>

      <div v-if="loading" class="space-y-3" aria-label="Loading Search Console properties">
        <USkeleton class="h-16 w-full" />
        <USkeleton class="h-16 w-full" />
      </div>

      <template v-else-if="selectedClientId">
        <UAlert
          v-if="hasDegradedConnection"
          title="Connection needs attention"
          description="Google property discovery failed for at least one account. Reconnect the account before starting evidence sync."
          icon="i-lucide-triangle-alert"
          color="error"
          variant="subtle"
        />

        <div v-if="hasConnections" class="space-y-4">
          <section
            v-for="connection in connections"
            :key="connection.connectionId"
            class="rounded-lg border border-default bg-elevated/40 p-4"
          >
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-highlighted">
                  {{ connection.email }}
                </p>
                <p class="mt-0.5 text-xs text-muted">
                  {{ connection.properties.length }} visible properties · {{ checkedLabel(connection) }}
                </p>
              </div>
              <UBadge
                :label="connection.status === 'active' ? 'Connected' : 'Needs attention'"
                :color="connection.status === 'active' ? 'success' : 'error'"
                variant="subtle"
              />
            </div>

            <p
              v-if="connection.lastErrorMessage"
              class="mt-3 text-sm text-error"
            >
              {{ connection.lastErrorMessage }}
            </p>

            <div v-if="connection.properties.length" class="mt-3 divide-y divide-default">
              <div
                v-for="property in connection.properties"
                :key="property.propertyUri"
                class="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <div class="min-w-0">
                  <p class="truncate font-mono text-xs text-highlighted">
                    {{ property.propertyUri }}
                  </p>
                  <p class="mt-0.5 text-xs text-muted">
                    {{ property.propertyType === 'domain' ? 'Domain property' : 'URL-prefix property' }}
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <UBadge
                    v-if="mappedStatus(connection.connectionId, property.propertyUri)"
                    label="Mapped"
                    color="success"
                    variant="subtle"
                  />
                  <UBadge
                    :label="permissionLabel(property.permissionLevel)"
                    :color="property.permissionLevel === 'siteUnverifiedUser' ? 'warning' : 'neutral'"
                    variant="subtle"
                  />
                </div>
              </div>
            </div>
            <p v-else class="mt-3 text-sm text-muted">
              No properties were returned for this Google account.
            </p>
          </section>
        </div>

        <UAlert
          v-else
          title="No Google account connected"
          description="Connect an account that can view the client's verified Search Console property."
          icon="i-lucide-link-2-off"
          color="neutral"
          variant="subtle"
        />

        <div v-if="verifiedProperties.length" class="grid grid-cols-1 gap-4">
          <UFormField
            label="Verified Search Console property"
            help="Unverified properties remain visible above for diagnosis but cannot be mapped."
          >
            <USelectMenu
              v-model="selectedPropertyKey"
              :items="verifiedProperties"
              value-key="value"
              placeholder="Choose one verified property"
              class="w-full"
              data-testid="search-console-property"
            />
          </UFormField>
          <div class="flex justify-end">
            <UButton
              label="Map evidence source"
              icon="i-lucide-git-compare-arrows"
              :loading="mapping"
              :disabled="!selectedProperty"
              data-testid="map-search-console-property"
              @click="mapProperty"
            />
          </div>
        </div>
      </template>
    </div>
  </UCard>
</template>
