<script setup lang="ts">
import WorkspaceSendUploader from './WorkspaceSendUploader.vue'
import {
  TRANSFER_STATUSES,
  type TransferStatus,
  type WorkspaceSendPolicySummary,
  type WorkspaceTransferListResponse,
  type WorkspaceTransferSummary
} from '~~/shared/types/send'

interface ClientOption { id: string, name: string }
interface ProjectOption { id: string, name: string, clientId: string }
const apiFetch = $fetch as <T>(url: string, options?: Record<string, unknown>) => Promise<T>
const toast = useToast()

const transfers = ref<WorkspaceTransferSummary[]>([])
const clients = ref<ClientOption[]>([])
const projects = ref<ProjectOption[]>([])
const loading = ref(true)
const creating = ref(false)
const listError = ref('')
const creationError = ref('')
const page = ref(1)
const hasMore = ref(false)
const policy = ref<WorkspaceSendPolicySummary | null>(null)
const status = ref<'all' | TransferStatus>('all')
const selectedTransferId = ref<string | null>(null)

function defaultExpiry(retentionDays = 7): string {
  const date = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

const form = ref({
  title: '',
  message: '',
  clientId: '',
  projectId: '',
  recipients: '',
  expiresAt: defaultExpiry(),
  password: '',
  maxDownloads: null as number | null
})

const statusOptions = [
  { label: 'All statuses', value: 'all' },
  ...TRANSFER_STATUSES.map(value => ({
    label: value.replaceAll('_', ' ').replace(/^./, character => character.toUpperCase()),
    value
  }))
]

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
      form.value.expiresAt = defaultExpiry(response.policy.defaultRetentionDays)
    }
  } catch (error) {
    listError.value = readableError(error, 'Transfers could not be loaded.')
  } finally {
    loading.value = false
  }
}

async function loadClients() {
  try {
    clients.value = await apiFetch<ClientOption[]>('/api/agency/clients', {
      query: { active: true }
    })
  } catch {
    clients.value = []
  }
}

watch(status, () => {
  page.value = 1
  void loadTransfers()
})

watch(() => form.value.clientId, async (clientId) => {
  form.value.projectId = ''
  projects.value = []
  if (!clientId) return
  try {
    projects.value = await apiFetch<ProjectOption[]>('/api/agency/projects', {
      query: { clientId, status: 'active' }
    })
  } catch {
    projects.value = []
  }
})

function normalizedRecipients(): string[] {
  return form.value.recipients
    .split(/[\n,;]/)
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
}

async function createDraft() {
  creationError.value = ''
  if (!policy.value) {
    creationError.value = 'Transfer policy is not available yet. Please try again.'
    return
  }
  creating.value = true
  try {
    const result = await apiFetch<{ transfer: WorkspaceTransferSummary }>('/api/agency/send', {
      method: 'POST',
      body: {
        title: form.value.title,
        message: form.value.message || undefined,
        clientId: form.value.clientId || undefined,
        projectId: form.value.projectId || undefined,
        recipients: normalizedRecipients(),
        expiresAt: new Date(form.value.expiresAt).toISOString(),
        password: form.value.password || undefined,
        maxDownloads: form.value.maxDownloads === null ? undefined : Number(form.value.maxDownloads),
        idempotencyKey: crypto.randomUUID()
      }
    })
    toast.add({ title: 'Transfer draft created', color: 'success' })
    selectedTransferId.value = result.transfer.id
    form.value = {
      title: '',
      message: '',
      clientId: '',
      projectId: '',
      recipients: '',
      expiresAt: defaultExpiry(policy.value.defaultRetentionDays),
      password: '',
      maxDownloads: null
    }
    page.value = 1
    await loadTransfers()
  } catch (error) {
    creationError.value = readableError(error, 'The transfer draft could not be created.')
  } finally {
    creating.value = false
  }
}

function movePage(direction: -1 | 1) {
  page.value += direction
  void loadTransfers()
}

function statusColor(value: TransferStatus): 'neutral' | 'info' | 'warning' | 'success' | 'error' {
  if (value === 'ready') return 'success'
  if (value === 'failed' || value === 'revoked') return 'error'
  if (value === 'uploading' || value === 'scanning') return 'info'
  if (value === 'expired' || value === 'deletion_pending') return 'warning'
  return 'neutral'
}

void Promise.all([loadTransfers(), loadClients()])
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
    <UCard>
      <template #header>
        <div>
          <h2 class="text-lg font-semibold text-highlighted">
            Create a transfer draft
          </h2>
          <p class="mt-1 text-sm text-muted">
            Set access and delivery details now. Files are added in the next step.
          </p>
        </div>
      </template>

      <form class="space-y-4" data-testid="send-draft-form" @submit.prevent="createDraft">
        <div>
          <label for="send-title" class="mb-1 block text-sm font-medium">Title</label>
          <input
            id="send-title"
            v-model="form.title"
            data-testid="send-title"
            required
            maxlength="255"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
          >
        </div>

        <div>
          <label for="send-message" class="mb-1 block text-sm font-medium">Message <span class="text-muted">(optional)</span></label>
          <textarea
            id="send-message"
            v-model="form.message"
            rows="3"
            maxlength="5000"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="send-client" class="mb-1 block text-sm font-medium">Client <span class="text-muted">(optional)</span></label>
            <select id="send-client" v-model="form.clientId" class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm">
              <option value="">
                No client
              </option>
              <option v-for="client in clients" :key="client.id" :value="client.id">
                {{ client.name }}
              </option>
            </select>
          </div>
          <div>
            <label for="send-project" class="mb-1 block text-sm font-medium">Project <span class="text-muted">(optional)</span></label>
            <select
              id="send-project"
              v-model="form.projectId"
              :disabled="!form.clientId"
              class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="">
                No project
              </option>
              <option v-for="project in projects" :key="project.id" :value="project.id">
                {{ project.name }}
              </option>
            </select>
          </div>
        </div>

        <div>
          <label for="send-recipients" class="mb-1 block text-sm font-medium">Recipients <span class="text-muted">(optional)</span></label>
          <textarea
            id="send-recipients"
            v-model="form.recipients"
            rows="2"
            placeholder="name@example.com, another@example.com"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
          />
          <p class="mt-1 text-xs text-muted">
            Separate addresses with commas or new lines.
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="send-expiry" class="mb-1 block text-sm font-medium">Expires</label>
            <input
              id="send-expiry"
              v-model="form.expiresAt"
              type="datetime-local"
              required
              class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
            >
          </div>
          <div>
            <label for="send-downloads" class="mb-1 block text-sm font-medium">Maximum downloads</label>
            <input
              id="send-downloads"
              v-model.number="form.maxDownloads"
              type="number"
              min="1"
              :max="policy?.maxDownloads"
              placeholder="Use policy default"
              class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
            >
          </div>
        </div>

        <div>
          <label for="send-password" class="mb-1 block text-sm font-medium">Password <span class="text-muted">(optional)</span></label>
          <input
            id="send-password"
            v-model="form.password"
            type="password"
            minlength="8"
            maxlength="128"
            autocomplete="new-password"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
          >
        </div>

        <p
          v-if="creationError"
          role="alert"
          aria-live="assertive"
          class="rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
          data-testid="send-creation-error"
        >
          {{ creationError }}
        </p>

        <UButton
          type="submit"
          block
          icon="i-lucide-arrow-up-right"
          :loading="creating"
          :disabled="creating || !policy"
          data-testid="create-send-draft"
        >
          Create draft
        </UButton>
      </form>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              Transfers
            </h2>
            <p class="mt-1 text-sm text-muted">
              Only transfers you own, manage, or can access through a client are shown.
            </p>
          </div>
          <label class="flex items-center gap-2 text-sm">
            <span>Status</span>
            <select v-model="status" aria-label="Filter transfers by status" class="rounded-lg border border-default bg-default px-3 py-2 text-sm">
              <option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
        </div>
      </template>

      <div aria-live="polite">
        <div v-if="loading" class="space-y-3" data-testid="send-list-loading">
          <div v-for="index in 3" :key="index" class="h-20 animate-pulse rounded-lg bg-elevated" />
        </div>

        <div
          v-else-if="listError"
          role="alert"
          class="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error"
          data-testid="send-list-error"
        >
          <p>{{ listError }}</p>
          <UButton
            class="mt-3"
            size="sm"
            color="neutral"
            variant="outline"
            @click="loadTransfers"
          >
            Try again
          </UButton>
        </div>

        <div v-else-if="transfers.length === 0" class="rounded-xl border border-dashed border-default px-6 py-12 text-center" data-testid="send-list-empty">
          <UIcon name="i-lucide-package-open" class="mx-auto size-9 text-muted" />
          <h3 class="mt-3 font-medium text-highlighted">
            No transfers yet
          </h3>
          <p class="mt-1 text-sm text-muted">
            Create a draft to start preparing files for delivery.
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
                    {{ transfer.status.replaceAll('_', ' ') }}
                  </UBadge>
                </div>
                <p class="mt-1 text-sm text-muted">
                  {{ transfer.fileCount }} files · {{ transfer.recipientCount }} recipients · expires {{ new Date(transfer.expiresAt).toLocaleDateString() }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UIcon
                  v-if="transfer.passwordProtected"
                  name="i-lucide-lock-keyhole"
                  aria-label="Password protected"
                  class="size-4 text-muted"
                />
                <UButton
                  v-if="policy && ['draft', 'uploading'].includes(transfer.status)"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  data-testid="toggle-send-uploader"
                  @click="selectedTransferId = selectedTransferId === transfer.id ? null : transfer.id"
                >
                  {{ selectedTransferId === transfer.id ? 'Close files' : 'Add files' }}
                </UButton>
              </div>
            </div>
            <WorkspaceSendUploader
              v-if="policy && selectedTransferId === transfer.id"
              :transfer-id="transfer.id"
              :existing-file-count="transfer.fileCount"
              :existing-total-bytes="transfer.totalBytes"
              :policy="policy"
              @uploaded="loadTransfers"
            />
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
  </div>
</template>
