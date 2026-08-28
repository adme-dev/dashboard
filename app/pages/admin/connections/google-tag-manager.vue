<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: ['role-admin'] })

interface GtmAdminOverview {
  configuration: { oauthConfigured: boolean, callbackPath: string }
  summary: { activeConnections: number, linkedSites: number, verifiedSites: number, failedChanges: number }
  quota: { used: number, budget: number, windowSeconds: number, windowStartedAt: string | null }
  connections: Array<{
    id: string
    googleEmail: string
    status: string
    credentialStatus: string
    tokenExpiresAt: string | null
    scopes: string[]
    accessibleAccountCount: number
    bindingCount: number
    lastDiscoveredAt: string | null
    createdAt: string
    connectedBy: { name: string | null, email: string | null }
  }>
  bindings: Array<{
    id: string
    trackingSiteId: string
    siteName: string
    clientId: string
    clientName: string
    googleEmail: string
    accountName: string
    containerName: string
    containerPublicId: string
    domainNames: string[]
    lastVerifiedAt: string | null
    latestChangeStatus: string | null
    latestChangeAt: string | null
  }>
  recentChanges: Array<{
    id: string
    trackingSiteId: string
    siteName: string
    clientName: string
    actionType: string
    status: string
    errorMessage: string | null
    requestedAt: string
  }>
}

type Connection = GtmAdminOverview['connections'][number]
type Binding = GtmAdminOverview['bindings'][number]
type Change = GtmAdminOverview['recentChanges'][number]

const apiFetch = $fetch as <T = unknown>(request: string, options?: Record<string, unknown>) => Promise<T>
const toast = useToast()
const data = ref<GtmAdminOverview | null>(null)
const pending = ref(false)
const action = ref<string | null>(null)
const disconnectTarget = ref<Connection | null>(null)
const disconnectOpen = computed({
  get: () => Boolean(disconnectTarget.value),
  set: (open: boolean) => { if (!open) disconnectTarget.value = null }
})

const bindingColumns = [
  { accessorKey: 'clientName', header: 'Client and site' },
  { accessorKey: 'containerName', header: 'Container' },
  { accessorKey: 'googleEmail', header: 'Google account' },
  { accessorKey: 'lastVerifiedAt', header: 'Live verification' },
  { accessorKey: 'actions', header: '' }
]
const changeColumns = [
  { accessorKey: 'requestedAt', header: 'Requested' },
  { accessorKey: 'clientName', header: 'Client and site' },
  { accessorKey: 'actionType', header: 'Action' },
  { accessorKey: 'status', header: 'Outcome' }
]
const bindingRow = (row: unknown): Binding => ((row as { original?: Binding }).original ?? row) as Binding
const changeRow = (row: unknown): Change => ((row as { original?: Change }).original ?? row) as Change

function formatDate(value: string | null) {
  if (!value) return 'Not yet'
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function statusColor(status: string) {
  if (['active', 'verified', 'published', 'rolled_back', 'versioned'].includes(status)) return 'success' as const
  if (['failed', 'conflict', 'error', 'expired'].includes(status)) return 'error' as const
  if (['planned', 'executing', 'drafted'].includes(status)) return 'warning' as const
  return 'neutral' as const
}

function actionLabel(actionType: string) {
  return actionType === 'install_xeroflow' ? 'Install XeroFlow' : actionType.replaceAll('_', ' ')
}

function errorMessage(error: unknown, fallback: string) {
  const candidate = error as { data?: { statusMessage?: string }, message?: string }
  return candidate.data?.statusMessage || candidate.message || fallback
}

async function refresh() {
  pending.value = true
  try {
    data.value = await apiFetch<GtmAdminOverview>('/api/admin/integrations/google-tag-manager')
  } catch (error: unknown) {
    toast.add({
      title: 'GTM health could not be loaded',
      description: errorMessage(error, 'Check the database and deployment configuration.'),
      color: 'error'
    })
  } finally {
    pending.value = false
  }
}

async function connectGoogle() {
  action.value = 'connect'
  try {
    const result = await apiFetch<{ url: string }>('/api/agency/tracking/gtm/connect')
    const popup = window.open(result.url, `gtm_admin_connect_${Date.now()}`, 'width=600,height=720,scrollbars=yes')
    if (!popup) throw new Error('Your browser blocked the Google connection popup')
  } catch (error: unknown) {
    toast.add({ title: 'Google connection could not start', description: errorMessage(error, 'Try again.'), color: 'error' })
    action.value = null
  }
}

function onOAuthMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) return
  const result = event.data as { type?: string, platform?: string, success?: boolean, error?: string }
  if (result?.type !== 'oauth_result' || result.platform !== 'gtm') return
  action.value = null
  if (!result.success) {
    toast.add({ title: 'Google Tag Manager connection failed', description: result.error || 'Google denied the connection.', color: 'error' })
    return
  }
  toast.add({ title: 'Google Tag Manager connected', color: 'success' })
  void refresh()
}

function requestDisconnect(connection: Connection) {
  disconnectTarget.value = connection
}

function cancelDisconnect() {
  disconnectTarget.value = null
}

async function disconnect() {
  const connection = disconnectTarget.value
  if (!connection) return
  disconnectTarget.value = null
  action.value = `disconnect:${connection.id}`
  try {
    const result = await apiFetch<{ retainedBindingCount: number }>(
      `/api/admin/integrations/google-tag-manager/connections/${connection.id}`,
      { method: 'DELETE', body: { confirmed: true } }
    )
    toast.add({
      title: 'Google account disconnected',
      description: result.retainedBindingCount
        ? `${result.retainedBindingCount} existing site binding${result.retainedBindingCount === 1 ? '' : 's'} retained for recovery.`
        : 'The connection can be restored by reconnecting the same Google account.',
      color: 'success'
    })
    await refresh()
  } catch (error: unknown) {
    toast.add({ title: 'Connection was not disconnected', description: errorMessage(error, 'Try again.'), color: 'error' })
  } finally {
    action.value = null
  }
}

onMounted(() => window.addEventListener('message', onOAuthMessage))
onBeforeUnmount(() => window.removeEventListener('message', onOAuthMessage))

await refresh()

const quotaPercent = computed(() => {
  if (!data.value?.quota.budget) return 0
  return Math.min(100, Math.round((data.value.quota.used / data.value.quota.budget) * 100))
})
</script>

<template>
  <UDashboardPanel>
    <UDashboardNavbar title="Google Tag Manager">
      <template #leading>
        <UDashboardSidebarCollapse />
      </template>
      <template #trailing>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          :loading="pending"
          label="Refresh"
          @click="refresh"
        />
        <UButton
          icon="i-lucide-link"
          :loading="action === 'connect'"
          label="Connect Google"
          @click="connectGoogle"
        />
      </template>
    </UDashboardNavbar>

    <div class="flex-1 overflow-y-auto p-4 sm:p-6">
      <div class="mx-auto max-w-6xl space-y-6">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <UButton
            to="/admin/connections/integrations"
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            label="Integrations"
          />
          <span class="text-muted">/</span>
          <span class="font-medium text-highlighted">Google Tag Manager</span>
        </div>

        <UAlert
          v-if="data && !data.configuration.oauthConfigured"
          color="error"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="GTM OAuth is not configured"
          description="Set the dedicated GTM Google client ID and secret in the production deployment before connecting accounts."
        />

        <section v-if="data" class="overflow-hidden rounded-xl border border-default bg-default">
          <div class="border-b border-default bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 sm:p-6">
            <p class="text-sm font-medium text-primary">
              Live control path
            </p>
            <h1 class="mt-1 text-2xl font-semibold tracking-tight text-highlighted">
              From Google authority to verified client tag
            </h1>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-muted">
              OAuth access, exact container binding, versioned publishing and live read-back stay visible as one operational chain.
            </p>
          </div>
          <div class="grid grid-cols-1 divide-y divide-default sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <div
              v-for="step in [
                { label: 'OAuth ready', value: data.configuration.oauthConfigured ? 'Configured' : 'Missing', ok: data.configuration.oauthConfigured },
                { label: 'Active accounts', value: data.summary.activeConnections, ok: data.summary.activeConnections > 0 },
                { label: 'Linked sites', value: data.summary.linkedSites, ok: data.summary.linkedSites > 0 },
                { label: 'Verified live', value: data.summary.verifiedSites, ok: data.summary.verifiedSites > 0 }
              ]"
              :key="step.label"
              class="p-4"
            >
              <div class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                <span class="size-2 rounded-full" :class="step.ok ? 'bg-success' : 'bg-warning'" />
                {{ step.label }}
              </div>
              <p class="mt-2 text-xl font-semibold text-highlighted">
                {{ step.value }}
              </p>
            </div>
          </div>
        </section>

        <div v-if="data" class="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_18rem]">
          <UCard>
            <template #header>
              <div>
                <h2 class="font-semibold text-highlighted">
                  Connected Google accounts
                </h2>
                <p class="mt-1 text-sm text-muted">
                  Reconnect the same identity to renew access without losing client bindings.
                </p>
              </div>
            </template>

            <div v-if="!data.connections.length" class="py-8 text-center">
              <UIcon name="i-lucide-unplug" class="mx-auto size-8 text-muted" />
              <p class="mt-3 text-sm font-medium text-highlighted">
                No GTM accounts connected
              </p>
              <p class="mt-1 text-sm text-muted">
                Connect a business-managed Google identity with access to client containers.
              </p>
            </div>
            <div v-else class="divide-y divide-default">
              <div v-for="connection in data.connections" :key="connection.id" class="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="truncate font-medium text-highlighted">
                      {{ connection.googleEmail }}
                    </p>
                    <UBadge :color="statusColor(connection.status)" variant="subtle">
                      {{ connection.status }}
                    </UBadge>
                  </div>
                  <p class="mt-1 text-xs text-muted">
                    {{ connection.accessibleAccountCount }} accessible GTM account{{ connection.accessibleAccountCount === 1 ? '' : 's' }} ·
                    {{ connection.bindingCount }} client binding{{ connection.bindingCount === 1 ? '' : 's' }} ·
                    connected by {{ connection.connectedBy.name || connection.connectedBy.email || 'an administrator' }}
                  </p>
                  <p class="mt-1 text-xs text-muted">
                    Token expiry: {{ formatDate(connection.tokenExpiresAt) }}
                  </p>
                </div>
                <div class="flex shrink-0 gap-2">
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-refresh-cw"
                    label="Reconnect"
                    @click="connectGoogle"
                  />
                  <UButton
                    v-if="connection.status !== 'disconnected'"
                    size="sm"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-unplug"
                    label="Disconnect"
                    :loading="action === `disconnect:${connection.id}`"
                    @click="requestDisconnect(connection)"
                  />
                </div>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                API pacing
              </h2>
            </template>
            <div class="space-y-3">
              <div class="flex items-end justify-between gap-3">
                <div>
                  <p class="text-3xl font-semibold text-highlighted">
                    {{ data.quota.used }}
                  </p>
                  <p class="text-xs text-muted">
                    of {{ data.quota.budget }} reserved calls
                  </p>
                </div>
                <UBadge :color="quotaPercent >= 80 ? 'warning' : 'success'" variant="subtle">
                  {{ quotaPercent }}%
                </UBadge>
              </div>
              <UProgress :model-value="quotaPercent" :color="quotaPercent >= 80 ? 'warning' : 'primary'" />
              <p class="text-xs leading-5 text-muted">
                Shared {{ data.quota.windowSeconds }}-second safety window. Five Google calls remain reserved outside this budget for recovery.
              </p>
            </div>
          </UCard>
        </div>

        <UCard v-if="data">
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="font-semibold text-highlighted">
                  Client container bindings
                </h2>
                <p class="mt-1 text-sm text-muted">
                  Open the exact tracking site to publish, verify or roll back its managed version.
                </p>
              </div>
              <UBadge color="neutral" variant="subtle">
                {{ data.bindings.length }}
              </UBadge>
            </div>
          </template>
          <UTable :columns="bindingColumns" :data="data.bindings">
            <template #clientName-cell="{ row }">
              <div>
                <p class="font-medium text-highlighted">
                  {{ bindingRow(row).clientName }}
                </p><p class="text-xs text-muted">
                  {{ bindingRow(row).siteName }}
                </p>
              </div>
            </template>
            <template #containerName-cell="{ row }">
              <div>
                <p>{{ bindingRow(row).containerName }}</p><p class="font-mono text-xs text-muted">
                  {{ bindingRow(row).containerPublicId }}
                </p>
              </div>
            </template>
            <template #lastVerifiedAt-cell="{ row }">
              <div class="flex items-center gap-2">
                <UBadge :color="bindingRow(row).lastVerifiedAt ? 'success' : 'warning'" variant="subtle">
                  {{ bindingRow(row).lastVerifiedAt ? 'Verified' : 'Not verified' }}
                </UBadge>
                <span class="text-xs text-muted">{{ formatDate(bindingRow(row).lastVerifiedAt) }}</span>
              </div>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end">
                <UButton
                  :to="`/agency/tracking?clientId=${bindingRow(row).clientId}&siteId=${bindingRow(row).trackingSiteId}`"
                  size="sm"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-external-link"
                  label="Manage GTM"
                />
              </div>
            </template>
          </UTable>
        </UCard>

        <UCard v-if="data">
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="font-semibold text-highlighted">
                  Recent GTM changes
                </h2><p class="mt-1 text-sm text-muted">
                  Version creation, publishing, verification failures and rollbacks.
                </p>
              </div>
              <UBadge :color="data.summary.failedChanges ? 'warning' : 'success'" variant="subtle">
                {{ data.summary.failedChanges ? `${data.summary.failedChanges} need attention` : 'No recent failures' }}
              </UBadge>
            </div>
          </template>
          <UTable :columns="changeColumns" :data="data.recentChanges">
            <template #requestedAt-cell="{ row }">
              <span class="text-sm text-muted">{{ formatDate(changeRow(row).requestedAt) }}</span>
            </template>
            <template #clientName-cell="{ row }">
              <div>
                <p class="font-medium text-highlighted">
                  {{ changeRow(row).clientName }}
                </p><p class="text-xs text-muted">
                  {{ changeRow(row).siteName }}
                </p>
              </div>
            </template>
            <template #actionType-cell="{ row }">
              {{ actionLabel(changeRow(row).actionType) }}
            </template>
            <template #status-cell="{ row }">
              <UTooltip :text="changeRow(row).errorMessage || changeRow(row).status">
                <UBadge :color="statusColor(changeRow(row).status)" variant="subtle">
                  {{ changeRow(row).status }}
                </UBadge>
              </UTooltip>
            </template>
          </UTable>
        </UCard>
      </div>
    </div>

    <UModal v-model:open="disconnectOpen">
      <template #content>
        <div class="space-y-4 p-5">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              Disconnect Google account?
            </h2>
            <p class="mt-1 text-sm leading-6 text-muted">
              {{ disconnectTarget?.googleEmail }} will stop authorising GTM reads and publishes. Existing client bindings and change history are retained so reconnecting the same identity can restore service.
            </p>
          </div>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              label="Keep connected"
              @click="cancelDisconnect"
            />
            <UButton
              color="error"
              icon="i-lucide-unplug"
              label="Disconnect"
              @click="disconnect"
            />
          </div>
        </div>
      </template>
    </UModal>
  </UDashboardPanel>
</template>
