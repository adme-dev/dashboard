<script setup lang="ts">
import WorkspaceSendUploader from './WorkspaceSendUploader.vue'
import {
  TRANSFER_STATUSES,
  type TransferStatus,
  type WorkspaceDownloadResponse,
  type WorkspaceSendPolicySummary,
  type WorkspaceTransferDetail,
  type WorkspaceTransferListResponse,
  type WorkspaceTransferSummary
} from '~~/shared/types/send'

interface ClientOption { id: string, name: string }
interface ProjectOption { id: string, name: string, clientId: string }

const NONE = '__none__'
const MINIMUM_EXPIRY_EXTENSION_MS = 60 * 1000
const apiFetch = $fetch as <T>(url: string, options?: Record<string, unknown>) => Promise<T>
const toast = useToast()

const transfers = ref<WorkspaceTransferSummary[]>([])
const clients = ref<ClientOption[]>([])
const projects = ref<ProjectOption[]>([])
const policy = ref<WorkspaceSendPolicySummary | null>(null)
const loading = ref(true)
const creating = ref(false)
const actionPending = ref(false)
const detailLoading = ref(false)
const listError = ref('')
const creationError = ref('')
const detailError = ref('')
const page = ref(1)
const hasMore = ref(false)
const status = ref<'all' | TransferStatus>('all')
const selectedTransferId = ref<string | null>(null)
const selectedTransfer = ref<WorkspaceTransferDetail | null>(null)
const revokeOpen = ref(false)
const expiryOpen = ref(false)
const extensionExpiresAt = ref('')

const form = ref({
  title: '',
  message: '',
  clientId: NONE,
  projectId: NONE,
  retentionDays: '7',
  maxDownloads: ''
})

const statusOptions = [
  { label: 'All statuses', value: 'all' },
  ...TRANSFER_STATUSES.map(value => ({ label: titleCase(value), value }))
]
const clientOptions = computed(() => [
  { label: 'Internal workspace', value: NONE },
  ...clients.value.map(client => ({ label: client.name, value: client.id }))
])
const projectOptions = computed(() => [
  { label: 'No project', value: NONE },
  ...projects.value.map(project => ({ label: project.name, value: project.id }))
])
const retentionDayChoices = computed(() => {
  const maximum = policy.value?.maxRetentionDays ?? 30
  const defaults = [policy.value?.defaultRetentionDays ?? 7, 7, 14, 30, maximum]
  return [...new Set(defaults)]
    .filter(days => days <= maximum)
    .sort((left, right) => left - right)
})
const retentionOptions = computed(() => {
  return retentionDayChoices.value
    .map(days => ({ label: `${days} days`, value: String(days) }))
})
const extensionOptions = computed(() => {
  if (!selectedTransfer.value || !policy.value) return []
  const createdAt = new Date(selectedTransfer.value.createdAt).getTime()
  const currentExpiry = new Date(selectedTransfer.value.expiresAt).getTime()
  if (!Number.isFinite(createdAt) || !Number.isFinite(currentExpiry)) return []
  return retentionDayChoices.value
    .map(days => ({
      label: `${new Date(createdAt + days * 86_400_000).toLocaleDateString()} (${days} days from creation)`,
      value: new Date(createdAt + days * 86_400_000).toISOString()
    }))
    .filter(option => new Date(option.value).getTime() - currentExpiry >= MINIMUM_EXPIRY_EXTENSION_MS)
})

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, character => character.toUpperCase())
}

function readableError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback
  const candidate = error as {
    message?: string
    statusMessage?: string
    data?: { message?: string, statusMessage?: string }
  }
  return candidate.data?.statusMessage
    || candidate.data?.message
    || candidate.statusMessage
    || candidate.message
    || fallback
}

function displaySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function statusColor(value: TransferStatus): 'neutral' | 'info' | 'warning' | 'success' | 'error' {
  if (value === 'ready') return 'success'
  if (value === 'failed' || value === 'revoked') return 'error'
  if (value === 'uploading' || value === 'scanning') return 'info'
  if (value === 'expired' || value === 'deletion_pending') return 'warning'
  return 'neutral'
}

async function loadTransfers() {
  loading.value = true
  listError.value = ''
  try {
    const response = await apiFetch<WorkspaceTransferListResponse>('/api/agency/send', {
      query: {
        page: page.value,
        pageSize: 25,
        ...(status.value === 'all' ? {} : { status: status.value })
      }
    })
    transfers.value = response.transfers
    hasMore.value = response.hasMore
    if (!policy.value) {
      policy.value = response.policy
      form.value.retentionDays = String(response.policy.defaultRetentionDays)
    }
  } catch (error) {
    listError.value = readableError(error, 'Transfers could not be loaded.')
  } finally {
    loading.value = false
  }
}

async function loadClients() {
  try {
    clients.value = await apiFetch<ClientOption[]>('/api/agency/clients', { query: { active: true } })
  } catch {
    clients.value = []
  }
}

async function loadDetail(transferId = selectedTransferId.value) {
  if (!transferId) return
  detailLoading.value = true
  detailError.value = ''
  try {
    const response = await apiFetch<{ transfer: WorkspaceTransferDetail }>(`/api/agency/send/${transferId}`)
    if (selectedTransferId.value === transferId) selectedTransfer.value = response.transfer
  } catch (error) {
    detailError.value = readableError(error, 'Transfer details could not be loaded.')
    selectedTransfer.value = null
  } finally {
    detailLoading.value = false
  }
}

watch(
  () => selectedTransfer.value?.publishAvailableAt,
  (publishAvailableAt, _previous, onCleanup) => {
    if (!publishAvailableAt || !selectedTransfer.value) return
    const availableAt = new Date(publishAvailableAt).getTime()
    if (!Number.isFinite(availableAt)) return
    const transferId = selectedTransfer.value.id
    const timer = setTimeout(() => {
      if (selectedTransferId.value === transferId) void loadDetail(transferId)
    }, Math.max(0, availableAt - Date.now() + 250))
    onCleanup(() => clearTimeout(timer))
  }
)

async function selectTransfer(transferId: string) {
  selectedTransferId.value = transferId
  selectedTransfer.value = null
  await loadDetail(transferId)
}

watch(status, () => {
  page.value = 1
  void loadTransfers()
})

watch(() => form.value.clientId, async (clientId) => {
  form.value.projectId = NONE
  projects.value = []
  if (clientId === NONE) return
  try {
    projects.value = await apiFetch<ProjectOption[]>('/api/agency/projects', {
      query: { clientId, status: 'active' }
    })
  } catch {
    projects.value = []
  }
})

async function createDraft() {
  creationError.value = ''
  if (!policy.value) {
    creationError.value = 'Transfer policy is not available yet. Please try again.'
    return
  }
  creating.value = true
  try {
    const expiresAt = new Date(Date.now() + Number(form.value.retentionDays) * 86_400_000).toISOString()
    const result = await apiFetch<{ transfer: WorkspaceTransferSummary }>('/api/agency/send', {
      method: 'POST',
      body: {
        title: form.value.title,
        message: form.value.message || undefined,
        clientId: form.value.clientId === NONE ? undefined : form.value.clientId,
        projectId: form.value.projectId === NONE ? undefined : form.value.projectId,
        expiresAt,
        maxDownloads: form.value.maxDownloads ? Number(form.value.maxDownloads) : undefined,
        idempotencyKey: crypto.randomUUID()
      }
    })
    toast.add({ title: 'Transfer draft created', description: 'Add files to prepare it for publication.', color: 'success' })
    form.value = {
      title: '',
      message: '',
      clientId: NONE,
      projectId: NONE,
      retentionDays: String(policy.value.defaultRetentionDays),
      maxDownloads: ''
    }
    page.value = 1
    await loadTransfers()
    await selectTransfer(result.transfer.id)
  } catch (error) {
    creationError.value = readableError(error, 'The transfer draft could not be created.')
  } finally {
    creating.value = false
  }
}

async function refreshSelected() {
  await Promise.all([loadTransfers(), loadDetail()])
}

async function publishTransfer() {
  if (!selectedTransfer.value) return
  actionPending.value = true
  detailError.value = ''
  try {
    await apiFetch(`/api/agency/send/${selectedTransfer.value.id}/publish`, {
      method: 'POST',
      body: { expectedVersion: selectedTransfer.value.version, idempotencyKey: crypto.randomUUID() }
    })
    toast.add({ title: 'Transfer published', description: 'It is now available to authenticated workspace users.', color: 'success' })
    await refreshSelected()
  } catch (error) {
    detailError.value = readableError(error, 'The transfer could not be published.')
  } finally {
    actionPending.value = false
  }
}

async function downloadFile(fileId: string) {
  if (!selectedTransfer.value) return
  actionPending.value = true
  detailError.value = ''
  try {
    const result = await apiFetch<WorkspaceDownloadResponse>(
      `/api/agency/send/${selectedTransfer.value.id}/files/${fileId}/downloads`,
      { method: 'POST', body: { idempotencyKey: crypto.randomUUID() } }
    )
    const anchor = document.createElement('a')
    anchor.href = result.url
    anchor.rel = 'noopener noreferrer'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    await refreshSelected()
  } catch (error) {
    detailError.value = readableError(error, 'The file could not be downloaded.')
  } finally {
    actionPending.value = false
  }
}

async function revokeTransfer() {
  if (!selectedTransfer.value) return
  actionPending.value = true
  detailError.value = ''
  try {
    await apiFetch(`/api/agency/send/${selectedTransfer.value.id}/revoke`, {
      method: 'POST',
      body: { expectedVersion: selectedTransfer.value.version, idempotencyKey: crypto.randomUUID() }
    })
    revokeOpen.value = false
    toast.add({ title: 'Transfer revoked', color: 'success' })
    await refreshSelected()
  } catch (error) {
    detailError.value = readableError(error, 'The transfer could not be revoked.')
  } finally {
    actionPending.value = false
  }
}

async function extendExpiry() {
  if (!selectedTransfer.value || !extensionExpiresAt.value) return
  actionPending.value = true
  detailError.value = ''
  try {
    await apiFetch(`/api/agency/send/${selectedTransfer.value.id}/expiry`, {
      method: 'PATCH',
      body: {
        expiresAt: extensionExpiresAt.value,
        expectedVersion: selectedTransfer.value.version,
        idempotencyKey: crypto.randomUUID()
      }
    })
    expiryOpen.value = false
    toast.add({ title: 'Transfer expiry extended', color: 'success' })
    await refreshSelected()
  } catch (error) {
    detailError.value = readableError(error, 'The transfer expiry could not be extended.')
  } finally {
    actionPending.value = false
  }
}

function openExpiryDialog(): void {
  const firstOption = extensionOptions.value[0]
  if (!firstOption) return
  extensionExpiresAt.value = firstOption.value
  expiryOpen.value = true
}

function closeExpiryDialog(): void {
  expiryOpen.value = false
}

function openRevokeDialog(): void {
  revokeOpen.value = true
}

function closeRevokeDialog(): void {
  revokeOpen.value = false
}

function movePage(direction: -1 | 1) {
  page.value += direction
  void loadTransfers()
}

void Promise.all([loadTransfers(), loadClients()])
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[minmax(0,390px)_minmax(0,1fr)]">
    <UCard>
      <template #header>
        <div>
          <div class="mb-2 flex items-center gap-2">
            <UBadge color="neutral" variant="subtle">
              Internal workspace
            </UBadge>
            <UIcon name="i-lucide-lock-keyhole" class="size-4 text-muted" />
          </div>
          <h2 class="text-lg font-semibold text-highlighted">
            New transfer
          </h2>
          <p class="mt-1 text-sm text-muted">
            Files stay private and require a Dashboard login.
          </p>
        </div>
      </template>

      <form class="space-y-4" data-testid="send-draft-form" @submit.prevent="createDraft">
        <UFormField label="Title" name="title" required>
          <UInput
            v-model="form.title"
            data-testid="send-title"
            required
            maxlength="255"
            placeholder="Campaign assets"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Message (optional)" name="message">
          <UTextarea
            v-model="form.message"
            :rows="3"
            maxlength="5000"
            class="w-full"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <UFormField label="Workspace scope" name="clientId">
            <USelect v-model="form.clientId" :items="clientOptions" class="w-full" />
          </UFormField>
          <UFormField label="Project (optional)" name="projectId">
            <USelect
              v-model="form.projectId"
              :items="projectOptions"
              :disabled="form.clientId === NONE"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <UFormField label="Retention" name="retentionDays">
            <USelect v-model="form.retentionDays" :items="retentionOptions" class="w-full" />
          </UFormField>
          <UFormField label="Maximum downloads (optional)" name="maxDownloads">
            <UInput
              v-model="form.maxDownloads"
              type="number"
              min="1"
              :max="policy?.maxDownloads"
              placeholder="Policy default"
              class="w-full"
            />
          </UFormField>
        </div>

        <UAlert
          v-if="creationError"
          color="error"
          variant="subtle"
          :description="creationError"
          aria-live="assertive"
          data-testid="send-creation-error"
        />

        <UButton
          type="submit"
          block
          icon="i-lucide-package-plus"
          :loading="creating"
          :disabled="creating || !policy"
          data-testid="create-send-draft"
        >
          Create transfer
        </UButton>
      </form>
    </UCard>

    <div class="space-y-6">
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-highlighted">
                Transfer register
              </h2>
              <p class="mt-1 text-sm text-muted">
                Your internal file handoffs, with expiry and download controls.
              </p>
            </div>
            <USelect
              v-model="status"
              :items="statusOptions"
              aria-label="Filter transfers by status"
              class="w-48"
            />
          </div>
        </template>

        <div aria-live="polite">
          <div v-if="loading" class="space-y-3" data-testid="send-list-loading">
            <div v-for="index in 3" :key="index" class="h-20 animate-pulse rounded-lg bg-elevated" />
          </div>
          <UAlert
            v-else-if="listError"
            color="error"
            variant="subtle"
            :description="listError"
            data-testid="send-list-error"
          >
            <template #actions>
              <UButton
                size="sm"
                color="neutral"
                variant="outline"
                @click="loadTransfers"
              >
                Try again
              </UButton>
            </template>
          </UAlert>
          <div
            v-else-if="transfers.length === 0"
            class="rounded-xl border border-dashed border-default px-6 py-12 text-center"
            data-testid="send-list-empty"
          >
            <UIcon name="i-lucide-package-open" class="mx-auto size-9 text-muted" />
            <h3 class="mt-3 font-medium text-highlighted">
              No transfers yet
            </h3>
            <p class="mt-1 text-sm text-muted">
              Create a transfer, attach files, then publish it internally.
            </p>
          </div>
          <ul v-else class="divide-y divide-default" data-testid="send-list">
            <li v-for="transfer in transfers" :key="transfer.id" class="py-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="truncate font-medium text-highlighted">
                      {{ transfer.title }}
                    </p>
                    <UBadge :color="statusColor(transfer.status)" variant="subtle">
                      {{ titleCase(transfer.status) }}
                    </UBadge>
                  </div>
                  <p class="mt-1 text-sm text-muted">
                    {{ transfer.fileCount }} files · {{ displaySize(transfer.totalBytes) }} · expires {{ new Date(transfer.expiresAt).toLocaleDateString() }}
                  </p>
                </div>
                <UButton
                  size="sm"
                  color="neutral"
                  :variant="selectedTransferId === transfer.id ? 'soft' : 'outline'"
                  icon="i-lucide-receipt-text"
                  data-testid="open-send-transfer"
                  @click="selectTransfer(transfer.id)"
                >
                  Open
                </UButton>
              </div>
            </li>
          </ul>
        </div>

        <template #footer>
          <div class="flex items-center justify-between">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="page === 1 || loading"
              @click="movePage(-1)"
            >
              Previous
            </UButton>
            <span class="text-sm text-muted">Page {{ page }}</span>
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="!hasMore || loading"
              @click="movePage(1)"
            >
              Next
            </UButton>
          </div>
        </template>
      </UCard>

      <UCard v-if="selectedTransferId" data-testid="send-transfer-manifest">
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-primary">
                Transfer manifest
              </p>
              <h2 class="mt-1 text-lg font-semibold text-highlighted">
                {{ selectedTransfer?.title || 'Loading transfer…' }}
              </h2>
            </div>
            <UBadge v-if="selectedTransfer" :color="statusColor(selectedTransfer.status)" variant="subtle">
              {{ titleCase(selectedTransfer.status) }}
            </UBadge>
          </div>
        </template>

        <div v-if="detailLoading" class="h-28 animate-pulse rounded-lg bg-elevated" />
        <div v-else-if="selectedTransfer" class="space-y-5">
          <div class="grid gap-3 text-sm sm:grid-cols-3">
            <div class="rounded-lg bg-elevated/60 p-3">
              <p class="text-xs text-muted">
                Files
              </p>
              <p class="mt-1 font-semibold text-highlighted">
                {{ selectedTransfer.files.length }}
              </p>
            </div>
            <div class="rounded-lg bg-elevated/60 p-3">
              <p class="text-xs text-muted">
                Downloads
              </p>
              <p class="mt-1 font-semibold text-highlighted">
                {{ selectedTransfer.downloadCount }} / {{ selectedTransfer.maxDownloads ?? 'Unlimited' }}
              </p>
            </div>
            <div class="rounded-lg bg-elevated/60 p-3">
              <p class="text-xs text-muted">
                Expires
              </p>
              <p class="mt-1 font-semibold text-highlighted">
                {{ new Date(selectedTransfer.expiresAt).toLocaleDateString() }}
              </p>
            </div>
          </div>

          <p v-if="selectedTransfer.message" class="text-sm text-muted">
            {{ selectedTransfer.message }}
          </p>

          <WorkspaceSendUploader
            v-if="policy && ['draft', 'uploading'].includes(selectedTransfer.status) && selectedTransfer.canManage"
            :transfer-id="selectedTransfer.id"
            :existing-file-count="selectedTransfer.fileCount"
            :existing-total-bytes="selectedTransfer.totalBytes"
            :policy="policy"
            @uploaded="refreshSelected"
          />

          <ul v-if="selectedTransfer.files.length" class="divide-y divide-default rounded-xl border border-default">
            <li v-for="file in selectedTransfer.files" :key="file.id" class="flex items-center justify-between gap-3 p-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-highlighted">
                  {{ file.fileName }}
                </p>
                <p class="mt-0.5 text-xs text-muted">
                  {{ displaySize(file.size) }} · {{ titleCase(file.state) }}
                </p>
              </div>
              <UButton
                v-if="selectedTransfer.status === 'ready' && file.state === 'clean'"
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-lucide-download"
                :loading="actionPending"
                @click="downloadFile(file.id)"
              >
                Download
              </UButton>
            </li>
          </ul>

          <UAlert
            v-if="selectedTransfer.publishAvailableAt"
            color="info"
            variant="subtle"
            title="Upload sealing"
            :description="`Publish is available after ${new Date(selectedTransfer.publishAvailableAt).toLocaleTimeString()}.`"
          />
          <UAlert
            v-if="detailError"
            color="error"
            variant="subtle"
            :description="detailError"
          />

          <div v-if="selectedTransfer.canManage && !['revoked', 'expired', 'deletion_pending', 'deleted'].includes(selectedTransfer.status)" class="flex flex-wrap justify-end gap-2">
            <UButton
              v-if="extensionOptions.length"
              color="neutral"
              variant="outline"
              icon="i-lucide-calendar-plus"
              :disabled="actionPending"
              @click="openExpiryDialog"
            >
              Extend expiry
            </UButton>
            <UButton
              color="error"
              variant="ghost"
              :disabled="actionPending"
              @click="openRevokeDialog"
            >
              Revoke
            </UButton>
            <UButton
              v-if="selectedTransfer.status === 'uploading'"
              icon="i-lucide-send"
              :loading="actionPending"
              :disabled="!selectedTransfer.canPublish || actionPending"
              @click="publishTransfer"
            >
              Publish internally
            </UButton>
          </div>
        </div>
        <UAlert
          v-else-if="detailError"
          color="error"
          variant="subtle"
          :description="detailError"
        />
      </UCard>
    </div>

    <UModal v-model:open="revokeOpen">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="font-semibold text-highlighted">
              Revoke this transfer?
            </h3>
          </template>
          <p class="text-sm text-muted">
            Files will immediately stop being downloadable and will be removed by retention cleanup.
          </p>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="outline" @click="closeRevokeDialog">
                Cancel
              </UButton>
              <UButton color="error" :loading="actionPending" @click="revokeTransfer">
                Revoke transfer
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <UModal v-model:open="expiryOpen">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="font-semibold text-highlighted">
              Extend this transfer?
            </h3>
          </template>
          <div class="space-y-3">
            <p class="text-sm text-muted">
              Choose a later expiry within the {{ policy?.maxRetentionDays }}-day workspace retention policy.
            </p>
            <UFormField label="New expiry" name="extensionExpiresAt">
              <USelect v-model="extensionExpiresAt" :items="extensionOptions" class="w-full" />
            </UFormField>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="outline" @click="closeExpiryDialog">
                Cancel
              </UButton>
              <UButton :loading="actionPending" :disabled="!extensionExpiresAt" @click="extendExpiry">
                Extend transfer
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
