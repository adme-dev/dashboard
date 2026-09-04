<script setup lang="ts">
const props = defineProps<{ siteId: string }>()
const apiFetch = $fetch as <T = unknown>(request: string, options?: Record<string, unknown>) => Promise<T>

interface Connection {
  id: string
  googleEmail: string
  status: string
}

interface Account {
  path: string
  name: string
}

interface Container {
  path: string
  name: string
  publicId: string
  domainName?: string[]
}

interface Binding {
  id: string
  connectionId: string
  accountPath: string
  accountName: string
  containerPath: string
  containerPublicId: string
  containerName: string
  domainNames: string[]
  lastLiveVersionPath: string | null
  lastVerifiedAt: string | null
}

interface ChangeSet {
  id: string
  action_type: string
  status: string
  requested_at: string
  created_version_path: string | null
  previous_live_version_path: string | null
  error_message: string | null
}

interface SiteStatus {
  binding: Binding | null
  googleEmail?: string
  installed?: boolean
  liveVersion?: { path: string, name: string | null, tagCount: number, triggerCount: number } | null
  changes: ChangeSet[]
}

const toast = useToast()
const connections = ref<Connection[]>([])
const accounts = ref<Account[]>([])
const containers = ref<Container[]>([])
const siteStatus = ref<SiteStatus | null>(null)
const selectedConnection = ref<string>('')
const selectedAccount = ref<string>('')
const selectedContainer = ref<string>('')
const loading = ref(true)
const action = ref<string | null>(null)
const unavailable = ref(false)
const showSelector = ref(false)
const confirmation = ref<'publish' | 'rollback' | null>(null)
const rollbackChangeId = ref<string | null>(null)
const confirmationOpen = computed({
  get: () => confirmation.value !== null,
  set: (open: boolean) => {
    if (!open) confirmation.value = null
  },
})

const connectionItems = computed(() => connections.value.map(item => ({
  label: item.googleEmail,
  value: item.id,
})))
const accountItems = computed(() => accounts.value.map(item => ({ label: item.name, value: item.path })))
const containerItems = computed(() => containers.value.map(item => ({
  label: `${item.name} · ${item.publicId}`,
  value: item.path,
})))
const selectedAccountRow = computed(() => accounts.value.find(item => item.path === selectedAccount.value) || null)
const selectedContainerRow = computed(() => containers.value.find(item => item.path === selectedContainer.value) || null)
const readyToBind = computed(() => Boolean(
  selectedConnection.value && selectedAccountRow.value && selectedContainerRow.value,
))
const versionedChange = computed(() => siteStatus.value?.changes.find(change => change.status === 'versioned') || null)
const rollbackCandidate = computed(() => siteStatus.value?.changes.find(change => (
  ['verified', 'published', 'failed'].includes(change.status) && change.previous_live_version_path
)) || null)

function errorDescription(error: unknown): string {
  const raw = error as { data?: { statusMessage?: string }, message?: string }
  return raw?.data?.statusMessage || raw?.message || 'Google Tag Manager request failed'
}

async function loadConnections() {
  try {
    const result = await apiFetch<{ connections: Connection[] }>('/api/agency/tracking/gtm/connections')
    connections.value = result.connections
    if (!selectedConnection.value && connections.value[0]) selectedConnection.value = connections.value[0].id
  } catch (error: any) {
    if (error?.statusCode === 403 || error?.response?.status === 403) unavailable.value = true
    else throw error
  }
}

async function loadStatus() {
  siteStatus.value = await apiFetch<SiteStatus>(`/api/agency/tracking/gtm/sites/${props.siteId}/status`)
  const binding = siteStatus.value.binding
  if (binding) {
    selectedConnection.value = binding.connectionId
    selectedAccount.value = binding.accountPath
    selectedContainer.value = binding.containerPath
  }
}

async function initialise() {
  loading.value = true
  try {
    await Promise.all([loadConnections(), loadStatus()])
  } catch (error) {
    toast.add({ title: 'Could not load Google Tag Manager', description: errorDescription(error), color: 'error' })
  } finally {
    loading.value = false
  }
}

async function loadAccounts() {
  if (!selectedConnection.value) return
  action.value = 'accounts'
  try {
    const result = await apiFetch<{ accounts: Account[] }>('/api/agency/tracking/gtm/accounts', {
      query: { connectionId: selectedConnection.value },
    })
    accounts.value = result.accounts
    if (!accounts.value.some(item => item.path === selectedAccount.value)) selectedAccount.value = ''
  } catch (error) {
    toast.add({ title: 'Could not load GTM accounts', description: errorDescription(error), color: 'error' })
  } finally {
    action.value = null
  }
}

async function loadContainers() {
  if (!selectedConnection.value || !selectedAccount.value) return
  action.value = 'containers'
  try {
    const result = await apiFetch<{ containers: Container[] }>('/api/agency/tracking/gtm/containers', {
      query: { connectionId: selectedConnection.value, accountPath: selectedAccount.value },
    })
    containers.value = result.containers
    if (!containers.value.some(item => item.path === selectedContainer.value)) selectedContainer.value = ''
  } catch (error) {
    toast.add({ title: 'Could not load GTM containers', description: errorDescription(error), color: 'error' })
  } finally {
    action.value = null
  }
}

watch(selectedConnection, (next, previous) => {
  if (!next || next === previous) return
  accounts.value = []
  containers.value = []
  selectedAccount.value = ''
  selectedContainer.value = ''
  void loadAccounts()
})

watch(selectedAccount, (next, previous) => {
  if (!next || next === previous) return
  containers.value = []
  selectedContainer.value = ''
  void loadContainers()
})

async function connectGoogle() {
  action.value = 'connect'
  try {
    const { url } = await apiFetch<{ url: string }>('/api/agency/tracking/gtm/connect')
    const popup = window.open(url, `gtm_connect_${Date.now()}`, 'width=600,height=720,scrollbars=yes')
    if (!popup) throw new Error('Your browser blocked the Google connection popup')
  } catch (error) {
    toast.add({ title: 'Could not start Google connection', description: errorDescription(error), color: 'error' })
    action.value = null
  }
}

function onOAuthMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) return
  const result = event.data as { type?: string, platform?: string, success?: boolean, error?: string }
  if (result?.type !== 'oauth_result' || result.platform !== 'gtm') return
  action.value = null
  if (!result.success) {
    toast.add({ title: 'Google Tag Manager connection failed', description: result.error || 'Google denied the connection', color: 'error' })
    return
  }
  toast.add({ title: 'Google Tag Manager connected', color: 'success' })
  void loadConnections().then(loadAccounts)
}

onMounted(() => window.addEventListener('message', onOAuthMessage))
onBeforeUnmount(() => window.removeEventListener('message', onOAuthMessage))

async function bindContainer() {
  const account = selectedAccountRow.value
  const container = selectedContainerRow.value
  if (!readyToBind.value || !account || !container) return
  action.value = 'bind'
  try {
    await apiFetch(`/api/agency/tracking/gtm/sites/${props.siteId}/binding`, {
      method: 'PUT',
      body: {
        connectionId: selectedConnection.value,
        accountPath: account.path,
        containerPath: container.path,
      },
    })
    toast.add({ title: 'GTM container linked', description: `${container.name} · ${container.publicId}`, color: 'success' })
    showSelector.value = false
    await loadStatus()
  } catch (error) {
    toast.add({ title: 'Could not link container', description: errorDescription(error), color: 'error' })
  } finally {
    action.value = null
  }
}

async function createDraft() {
  action.value = 'draft'
  try {
    const result = await apiFetch<{ status: string }>(`/api/agency/tracking/gtm/sites/${props.siteId}/install`, {
      method: 'POST',
      body: { confirmed: true, publish: false },
    })
    toast.add({
      title: result.status === 'already_installed' ? 'XeroFlow tag is already installed' : 'GTM version created',
      description: result.status === 'already_installed' ? 'No duplicate tag was created.' : 'Review it here, then publish when ready.',
      color: 'success',
    })
    await loadStatus()
  } catch (error) {
    toast.add({ title: 'Could not create GTM version', description: errorDescription(error), color: 'error' })
  } finally {
    action.value = null
  }
}

async function publishInstall() {
  confirmation.value = null
  action.value = 'publish'
  try {
    if (versionedChange.value) {
      await apiFetch(`/api/agency/tracking/gtm/sites/${props.siteId}/changes/${versionedChange.value.id}/publish`, {
        method: 'POST',
        body: { confirmed: true },
      })
    } else {
      await apiFetch(`/api/agency/tracking/gtm/sites/${props.siteId}/install`, {
        method: 'POST',
        body: { confirmed: true, publish: true },
      })
    }
    toast.add({ title: 'XeroFlow tracking published through GTM', description: 'The live container read-back passed.', color: 'success' })
    await Promise.all([loadStatus(), apiFetch(`/api/agency/tracking/${props.siteId}/status`).catch(() => null)])
  } catch (error) {
    toast.add({ title: 'GTM publish failed', description: errorDescription(error), color: 'error' })
  } finally {
    action.value = null
  }
}

function requestRollback(change: ChangeSet) {
  rollbackChangeId.value = change.id
  confirmation.value = 'rollback'
}

async function rollback() {
  if (!rollbackChangeId.value) return
  confirmation.value = null
  action.value = 'rollback'
  try {
    await apiFetch(`/api/agency/tracking/gtm/sites/${props.siteId}/changes/${rollbackChangeId.value}/rollback`, {
      method: 'POST',
      body: { confirmed: true },
    })
    toast.add({ title: 'Previous GTM version restored', color: 'success' })
    await loadStatus()
  } catch (error) {
    toast.add({ title: 'Rollback failed', description: errorDescription(error), color: 'error' })
  } finally {
    action.value = null
    rollbackChangeId.value = null
  }
}

watch(() => props.siteId, initialise)
await initialise()

function openContainerSelector() {
  showSelector.value = true
}

function closeContainerSelector() {
  showSelector.value = false
}

function requestPublish() {
  confirmation.value = 'publish'
}

function closeConfirmation() {
  confirmation.value = null
}
</script>

<template>
  <div v-if="!unavailable" class="space-y-3 rounded-lg border border-default p-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-sm font-medium flex items-center gap-1.5">
          <UIcon name="i-lucide-container" class="size-4 text-primary" />
          Google Tag Manager API
        </p>
        <p class="mt-1 text-xs text-muted">
          Link a web container, create an isolated XeroFlow version, publish it, and verify the live read-back.
        </p>
      </div>
      <UBadge v-if="siteStatus?.installed" color="success" variant="soft">Live</UBadge>
      <UBadge v-else-if="siteStatus?.binding" color="warning" variant="soft">Linked</UBadge>
      <UBadge v-else color="neutral" variant="soft">Not linked</UBadge>
    </div>

    <div v-if="loading" class="flex items-center justify-center gap-2 py-5 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
      Checking Tag Manager…
    </div>

    <template v-else>
      <div v-if="siteStatus?.binding && !showSelector" class="rounded-lg bg-elevated p-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">{{ siteStatus.binding.containerName }}</p>
            <p class="text-xs text-muted">
              {{ siteStatus.binding.containerPublicId }} · {{ siteStatus.googleEmail }}
            </p>
            <p v-if="siteStatus.liveVersion" class="mt-1 text-xs text-muted">
              Live: {{ siteStatus.liveVersion.name || siteStatus.liveVersion.path }} ·
              {{ siteStatus.liveVersion.tagCount }} tags
            </p>
          </div>
          <UButton size="xs" color="neutral" variant="ghost" label="Change" @click="openContainerSelector" />
        </div>
      </div>

      <div v-if="!connections.length" class="flex items-center justify-between gap-3 rounded-lg bg-elevated p-3">
        <div>
          <p class="text-sm font-medium">Connect a Google account</p>
          <p class="text-xs text-muted">Use an account that already has access to the client’s GTM container.</p>
        </div>
        <UButton
          size="sm"
          icon="i-lucide-link"
          label="Connect Google"
          :loading="action === 'connect'"
          @click="connectGoogle"
        />
      </div>

      <div v-else-if="!siteStatus?.binding || showSelector" class="@container space-y-3">
        <div class="grid grid-cols-1 gap-3 @lg:grid-cols-2">
          <UFormField label="Google account" class="@lg:col-span-2">
            <USelectMenu
              v-model="selectedConnection"
              :items="connectionItems"
              value-key="value"
              class="w-full"
              placeholder="Choose a connected Google account"
            />
          </UFormField>
          <UFormField label="Tag Manager account">
            <USelectMenu
              v-model="selectedAccount"
              :items="accountItems"
              value-key="value"
              class="w-full"
              placeholder="Choose an account"
              :loading="action === 'accounts'"
            />
          </UFormField>
          <UFormField label="Web container">
            <USelectMenu
              v-model="selectedContainer"
              :items="containerItems"
              value-key="value"
              class="w-full"
              placeholder="Choose a container"
              :loading="action === 'containers'"
            />
          </UFormField>
        </div>
        <div class="flex justify-end gap-2">
          <UButton v-if="siteStatus?.binding" size="sm" color="neutral" variant="ghost" label="Cancel" @click="closeContainerSelector" />
          <UButton
            size="sm"
            icon="i-lucide-link-2"
            label="Link container"
            :disabled="!readyToBind"
            :loading="action === 'bind'"
            @click="bindContainer"
          />
        </div>
      </div>

      <div v-if="siteStatus?.binding" class="flex flex-wrap items-center gap-2">
        <UButton
          v-if="!siteStatus.installed && !versionedChange"
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-lucide-file-plus-2"
          label="Create draft version"
          :loading="action === 'draft'"
          @click="createDraft"
        />
        <UButton
          v-if="!siteStatus.installed"
          size="sm"
          icon="i-lucide-rocket"
          :label="versionedChange ? 'Publish draft' : 'Install and publish'"
          :loading="action === 'publish'"
          @click="requestPublish"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          label="Check live"
          :loading="action === 'check'"
          @click="action = 'check'; loadStatus().finally(() => action = null)"
        />
        <UButton
          v-if="siteStatus.installed && rollbackCandidate"
          size="sm"
          color="warning"
          variant="ghost"
          icon="i-lucide-undo-2"
          label="Roll back"
          :loading="action === 'rollback'"
          @click="requestRollback(rollbackCandidate)"
        />
      </div>

      <UAlert
        v-if="versionedChange && !siteStatus?.installed"
        color="info"
        variant="soft"
        icon="i-lucide-file-check-2"
        title="Draft version ready"
        description="The workspace compiled successfully. Publishing will make this version live on the linked website."
      />
    </template>

    <UModal v-model:open="confirmationOpen">
      <template #content>
        <div class="space-y-4 p-5">
          <div>
            <h3 class="font-semibold">
              {{ confirmation === 'rollback' ? 'Restore the previous GTM version?' : 'Publish XeroFlow tracking?' }}
            </h3>
            <p class="mt-1 text-sm text-muted">
              <template v-if="confirmation === 'rollback'">
                This republishes the version that was live before the XeroFlow change.
              </template>
              <template v-else>
                XeroFlow will publish a new version to {{ siteStatus?.binding?.containerName }}
                ({{ siteStatus?.binding?.containerPublicId }}) and verify it by reading the live container back from Google.
              </template>
            </p>
          </div>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Cancel" @click="closeConfirmation" />
            <UButton
              :color="confirmation === 'rollback' ? 'warning' : 'primary'"
              :icon="confirmation === 'rollback' ? 'i-lucide-undo-2' : 'i-lucide-rocket'"
              :label="confirmation === 'rollback' ? 'Restore version' : 'Publish and verify'"
              @click="confirmation === 'rollback' ? rollback() : publishInstall()"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
