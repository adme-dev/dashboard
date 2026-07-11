<!-- app/components/email/CampaignsPanel.vue -->
<!-- Campaigns list + draft creation (Phase 2b-1). Creating a draft optionally
     targets lists and materializes the recipient set (no sending — that's 2b-2). -->
<script setup lang="ts">
import {
  extractEmailBuilderScheduleError,
  validateEmailBuilderScheduleAt as validateCampaignScheduleAt
} from '~~/app/utils/emailBuilderSchedule'
import { describeEmailActionError } from '~~/app/utils/emailActionError'
import { describeEmailBuilderTestSendError } from '~~/app/utils/emailBuilderTestSend'

interface CampaignRow {
  id: string
  name: string
  subject: string | null
  status: string
  scheduled_at?: string | null
  to_send: number
  sent: number
  updated_at: string
  filter_rules?: { match: 'all' | 'any', rules: Array<{ field: string, op: string, value?: unknown }> } | null
  preflight_result?: CampaignPreflightResult | null
  recipient_snapshot?: RecipientSnapshot | null
}
interface ListRow { id: string, name: string }
interface CampaignPreflightCheck {
  code: string
  label?: string
  status: 'pass' | 'warning' | 'blocked'
  message: string
}
interface CampaignPreflightResult {
  ok: boolean
  blocked: boolean
  checkedAt?: string
  checks: CampaignPreflightCheck[]
}
interface RecipientSnapshot {
  listIds?: string[]
  dedupedRecipients?: number
  excludedUnsubscribed?: number
  excludedSuppressed?: number
  excludedBlocklisted?: number
  excludedDisabled?: number
  toSend?: number
  generatedAt?: string
}

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown }) => Promise<T>

const data = ref<{ campaigns: CampaignRow[] }>({ campaigns: [] })
const pending = ref(false)
const listsData = ref<{ items: ListRow[] }>({ items: [] })
const cfg = ref<{ sending_enabled: boolean }>({ sending_enabled: false })

async function refresh() {
  pending.value = true
  try {
    data.value = await apiFetch<{ campaigns: CampaignRow[] }>('/api/email/campaigns')
  } finally {
    pending.value = false
  }
}

async function refreshLists() {
  listsData.value = await apiFetch<{ items: ListRow[] }>('/api/email/lists')
}

async function refreshConfig() {
  cfg.value = await apiFetch<{ sending_enabled: boolean }>('/api/email/campaigns/config')
}

await Promise.all([refresh(), refreshLists(), refreshConfig()])

const listItems = computed(() =>
  (listsData.value?.items ?? []).map(l => ({ label: l.name, value: l.id }))
)

const STATUS_COLOR: Record<string, string> = {
  draft: 'neutral',
  scheduled: 'info',
  sending: 'warning',
  paused: 'warning',
  sent: 'success',
  cancelled: 'error'
}

const showCreate = ref(false)
const creating = ref(false)
const form = ref<{ name: string, subject: string, listIds: string[] }>({
  name: '',
  subject: '',
  listIds: []
})

function openCreate() {
  form.value = { name: '', subject: '', listIds: [] }
  showCreate.value = true
}

async function create() {
  if (!form.value.name.trim()) {
    toast.add({ title: 'Name required', color: 'error' })
    return
  }
  creating.value = true
  try {
    const { campaign } = await apiFetch<{ campaign: { id: string } }>('/api/email/campaigns', {
      method: 'POST',
      body: { name: form.value.name.trim(), subject: form.value.subject || null }
    })
    let recipients = 0
    if (form.value.listIds.length) {
      await apiFetch(`/api/email/campaigns/${campaign.id}/lists`, {
        method: 'PUT',
        body: { list_ids: form.value.listIds }
      })
      const res = await apiFetch<{ to_send: number }>(
        `/api/email/campaigns/${campaign.id}/materialize`,
        { method: 'POST' }
      )
      recipients = res.to_send
    }
    toast.add({
      title: 'Campaign created',
      description: form.value.listIds.length ? `${recipients} recipient(s) queued.` : 'Draft saved.',
      color: 'success'
    })
    showCreate.value = false
    refresh()
  } catch {
    toast.add({ title: 'Create failed', color: 'error' })
  } finally {
    creating.value = false
  }
}

// ── Send controls (gated) ──────────────────────────────────────────────────
const sendingEnabled = computed(() => !!cfg.value?.sending_enabled)

const busyId = ref<string | null>(null)
const showSend = ref(false)
const sendTarget = ref<CampaignRow | null>(null)
const showSchedule = ref(false)
const scheduleTarget = ref<CampaignRow | null>(null)
const showReport = ref(false)
const reportTarget = ref<CampaignRow | null>(null)
const scheduleAt = ref('')
const scheduleErrorPreflight = ref<CampaignPreflightResult | null>(null)
const scheduleErrorSnapshot = ref<RecipientSnapshot | null>(null)

// Audience / segment editing
const showSegment = ref(false)
const segmentTarget = ref<CampaignRow | null>(null)
function openSegment(row: CampaignRow) {
  segmentTarget.value = row
  showSegment.value = true
}

function formatDate(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function confirmSend(row: CampaignRow) {
  sendTarget.value = row
  showSend.value = true
}

function openSchedule(row: CampaignRow) {
  scheduleTarget.value = row
  scheduleAt.value = ''
  scheduleErrorPreflight.value = null
  scheduleErrorSnapshot.value = null
  showSchedule.value = true
}

function openReport(row: CampaignRow) {
  reportTarget.value = row
  showReport.value = true
}

function snapshotFallback(row: CampaignRow | null): RecipientSnapshot | null {
  if (!row) return null
  return row.recipient_snapshot ?? {
    toSend: row.to_send,
    generatedAt: row.updated_at
  }
}

const schedulePreflight = computed(() =>
  scheduleErrorPreflight.value ?? scheduleTarget.value?.preflight_result ?? null
)
const scheduleSnapshot = computed(() =>
  scheduleErrorSnapshot.value ?? snapshotFallback(scheduleTarget.value)
)
const sendPreflight = computed(() => sendTarget.value?.preflight_result ?? null)
const sendSnapshot = computed(() => snapshotFallback(sendTarget.value))
const scheduleBlocked = computed(() => !!schedulePreflight.value?.blocked)
const scheduleActionDisabled = computed(() =>
  scheduleBlocked.value || validateCampaignScheduleAt(scheduleAt.value) !== null
)
const sendBlocked = computed(() => !!sendPreflight.value?.blocked)

function rowSendBlocked(row: CampaignRow): boolean {
  return row.preflight_result?.blocked === true
}

function sendActionTooltip(row: CampaignRow): string {
  if (!sendingEnabled.value) return 'Sending disabled'
  if (rowSendBlocked(row)) return 'Resolve blocked preflight checks'
  if (row.to_send < 1) return 'No recipients ready'
  return 'Send'
}

async function scheduleCampaign() {
  const row = scheduleTarget.value
  if (!row) return
  const scheduleValidation = validateCampaignScheduleAt(scheduleAt.value)
  if (scheduleValidation) {
    toast.add({
      title: scheduleAt.value ? 'Invalid schedule time' : 'Schedule time required',
      description: scheduleValidation,
      color: 'error'
    })
    return
  }
  busyId.value = row.id
  scheduleErrorPreflight.value = null
  scheduleErrorSnapshot.value = null
  try {
    await apiFetch(`/api/email/campaigns/${row.id}`, {
      method: 'PATCH',
      body: { scheduled_at: new Date(scheduleAt.value).toISOString() }
    })
    toast.add({ title: 'Campaign scheduled', color: 'success' })
    showSchedule.value = false
    refresh()
  } catch (e) {
    const details = extractEmailBuilderScheduleError(e)
    scheduleErrorPreflight.value = details.preflight
    scheduleErrorSnapshot.value = details.recipientSnapshot
    toast.add({ title: 'Schedule failed', description: details.message, color: 'error' })
  } finally {
    busyId.value = null
  }
}

async function doSend() {
  const row = sendTarget.value
  if (!row) return
  if (sendBlocked.value) {
    toast.add({
      title: 'Campaign is blocked',
      description: 'Resolve the blocked preflight checks before sending.',
      color: 'error'
    })
    return
  }
  busyId.value = row.id
  try {
    const res = await apiFetch<{ sent: number, remaining: number, status: string }>(
      `/api/email/campaigns/${row.id}/send`, { method: 'POST' }
    )
    toast.add({
      title: res.status === 'sent' ? 'Campaign sent' : 'Sending…',
      description: `${res.sent} sent, ${res.remaining} remaining.`,
      color: 'success'
    })
    showSend.value = false
    refresh()
  } catch (e) {
    toast.add({
      title: 'Send failed',
      description: describeEmailActionError(e, 'Could not send campaign.'),
      color: 'error'
    })
  } finally {
    busyId.value = null
  }
}

async function pause(row: CampaignRow) {
  busyId.value = row.id
  try {
    await apiFetch(`/api/email/campaigns/${row.id}/pause`, { method: 'POST' })
    toast.add({ title: 'Paused', color: 'success' })
    refresh()
  } catch (e) {
    toast.add({
      title: 'Pause failed',
      description: describeEmailActionError(e, 'Could not pause campaign.'),
      color: 'error'
    })
  } finally {
    busyId.value = null
  }
}

async function cancel(row: CampaignRow) {
  busyId.value = row.id
  try {
    await apiFetch(`/api/email/campaigns/${row.id}/cancel`, { method: 'POST' })
    toast.add({ title: 'Cancelled', color: 'success' })
    refresh()
  } catch (e) {
    toast.add({
      title: 'Cancel failed',
      description: describeEmailActionError(e, 'Could not cancel campaign.'),
      color: 'error'
    })
  } finally {
    busyId.value = null
  }
}

async function testSend(row: CampaignRow) {
  busyId.value = row.id
  try {
    const res = await apiFetch<{ sent_to: string }>(
      `/api/email/campaigns/${row.id}/test-send`, { method: 'POST' }
    )
    toast.add({ title: 'Test sent', description: `Sent to ${res.sent_to}.`, color: 'success' })
  } catch (e) {
    toast.add({
      title: 'Test failed',
      description: describeEmailBuilderTestSendError(e),
      color: 'error'
    })
  } finally {
    busyId.value = null
  }
}

const SENDABLE = new Set(['draft', 'scheduled', 'paused'])
const TERMINAL = new Set(['sent', 'cancelled'])
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <p class="text-sm text-muted">
        {{ data?.campaigns?.length ?? 0 }} campaign(s)
      </p>
      <UButton icon="i-lucide-plus" label="New campaign" @click="openCreate" />
    </div>

    <UAlert
      v-if="!sendingEnabled"
      icon="i-lucide-shield-alert"
      color="warning"
      variant="subtle"
      title="Sending is disabled"
      description="Set EMAIL_SENDING_ENABLED=true and configure Resend to enable sending. You can still build, target, and materialize campaigns."
    />

    <div v-if="pending" class="text-sm text-muted">
      Loading…
    </div>
    <div v-else-if="!data?.campaigns?.length" class="text-sm text-muted py-8 text-center">
      No campaigns yet. Create a draft to target your lists.
    </div>

    <div v-else class="border border-default rounded-lg divide-y divide-default">
      <div
        v-for="row in data.campaigns"
        :key="row.id"
        class="flex items-center justify-between px-4 py-3"
      >
        <div class="min-w-0">
          <p class="font-medium truncate">
            {{ row.name }}
          </p>
          <p v-if="row.subject" class="text-sm text-muted truncate">
            {{ row.subject }}
          </p>
          <p v-if="row.scheduled_at" class="mt-0.5 text-xs text-muted">
            Scheduled {{ formatDate(row.scheduled_at) }}
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-xs text-muted">{{ row.sent }} / {{ row.to_send }} sent</span>
          <UBadge :color="(STATUS_COLOR[row.status] as any) || 'neutral'" variant="subtle">
            {{ row.status }}
          </UBadge>

          <UTooltip v-if="row.status === 'draft'" :text="row.filter_rules?.rules?.length ? 'Edit audience (segmented)' : 'Set audience'">
            <UButton
              icon="i-lucide-filter"
              variant="ghost"
              :color="row.filter_rules?.rules?.length ? 'primary' : 'neutral'"
              size="xs"
              label="Audience"
              @click="openSegment(row)"
            />
          </UTooltip>
          <UTooltip v-if="!TERMINAL.has(row.status)" text="Design the email">
            <UButton
              :to="`/agency/email/compose?campaign=${row.id}`"
              icon="i-lucide-layout-template"
              variant="ghost"
              color="neutral"
              size="xs"
              label="Design"
            />
          </UTooltip>
          <UButton
            icon="i-lucide-chart-no-axes-column"
            variant="ghost"
            color="neutral"
            size="xs"
            label="Report"
            @click="openReport(row)"
          />
          <UButton
            v-if="row.status === 'draft'"
            icon="i-lucide-calendar-clock"
            variant="ghost"
            color="neutral"
            size="xs"
            label="Schedule"
            :loading="busyId === row.id"
            @click="openSchedule(row)"
          />
          <UButton
            v-if="!TERMINAL.has(row.status)"
            icon="i-lucide-mail-check"
            variant="ghost"
            color="neutral"
            size="xs"
            title="Send a test to me"
            :loading="busyId === row.id"
            :disabled="!sendingEnabled"
            @click="testSend(row)"
          />
          <UTooltip v-if="SENDABLE.has(row.status)" :text="sendActionTooltip(row)">
            <UButton
              icon="i-lucide-send"
              color="primary"
              size="xs"
              label="Send"
              :loading="busyId === row.id"
              :disabled="!sendingEnabled || row.to_send < 1 || rowSendBlocked(row)"
              @click="confirmSend(row)"
            />
          </UTooltip>
          <UButton
            v-if="row.status === 'sending'"
            icon="i-lucide-pause"
            variant="soft"
            color="warning"
            size="xs"
            label="Pause"
            :loading="busyId === row.id"
            @click="pause(row)"
          />
          <UButton
            v-if="row.status === 'sending' || row.status === 'paused'"
            icon="i-lucide-x"
            variant="ghost"
            color="error"
            size="xs"
            label="Cancel"
            :loading="busyId === row.id"
            @click="cancel(row)"
          />
        </div>
      </div>
    </div>

    <UModal v-model:open="showCreate" title="New campaign">
      <template #content>
        <div class="p-4 space-y-4">
          <p class="text-sm font-semibold">
            New campaign
          </p>
          <UFormField label="Name" required>
            <UInput v-model="form.name" placeholder="e.g. March newsletter" class="w-full" />
          </UFormField>
          <UFormField label="Subject line">
            <UInput v-model="form.subject" placeholder="Subject shown in the inbox" class="w-full" />
          </UFormField>
          <UFormField label="Target lists" help="Recipients are computed now; nothing is sent.">
            <USelectMenu
              v-model="form.listIds"
              :items="listItems"
              value-key="value"
              multiple
              placeholder="Select lists"
              class="w-full"
            />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              label="Cancel"
              @click="showCreate = false"
            />
            <UButton
              color="primary"
              label="Create"
              :loading="creating"
              @click="create()"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showSchedule" title="Schedule campaign" :ui="{ content: 'max-w-2xl' }">
      <template #content>
        <div class="p-4 space-y-4">
          <div>
            <p class="text-sm font-semibold">
              Schedule “{{ scheduleTarget?.name }}”
            </p>
            <p class="text-sm text-muted">
              Preflight runs again when the schedule is saved.
            </p>
          </div>

          <EmailCampaignPreflightPanel
            :preflight="schedulePreflight"
            :recipient-snapshot="scheduleSnapshot"
          />

          <UFormField label="Send at" required>
            <UInput
              v-model="scheduleAt"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>

          <UAlert
            v-if="scheduleBlocked"
            color="error"
            variant="subtle"
            icon="i-lucide-shield-alert"
            title="Campaign is blocked"
            description="Resolve the blocked preflight checks before scheduling."
          />

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              label="Cancel"
              @click="showSchedule = false"
            />
            <UButton
              color="primary"
              icon="i-lucide-calendar-check"
              label="Schedule"
              :loading="busyId === scheduleTarget?.id"
              :disabled="scheduleActionDisabled"
              @click="scheduleCampaign()"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showSend" title="Send campaign">
      <template #content>
        <div class="p-4 space-y-4">
          <p class="text-sm font-semibold">
            Send “{{ sendTarget?.name }}”?
          </p>
          <p class="text-sm text-muted">
            This sends a real email to
            <span class="font-medium text-default">{{ sendTarget?.to_send }}</span>
            recipient(s). This can't be undone.
          </p>
          <EmailCampaignPreflightPanel
            :preflight="sendPreflight"
            :recipient-snapshot="sendSnapshot"
          />
          <UAlert
            v-if="sendBlocked"
            color="error"
            variant="subtle"
            icon="i-lucide-shield-alert"
            title="Campaign is blocked"
            description="Resolve the blocked preflight checks before sending."
          />
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              label="Cancel"
              @click="showSend = false"
            />
            <UButton
              color="primary"
              icon="i-lucide-send"
              label="Send now"
              :loading="busyId === sendTarget?.id"
              :disabled="sendBlocked"
              @click="doSend()"
            />
          </div>
        </div>
      </template>
    </UModal>

    <EmailSegmentBuilder
      v-model:open="showSegment"
      :campaign-id="segmentTarget?.id || null"
      :campaign-name="segmentTarget?.name"
      :initial="segmentTarget?.filter_rules || null"
      @saved="refresh()"
    />
    <EmailCampaignReportDrawer
      v-model:open="showReport"
      :campaign-id="reportTarget?.id || null"
      :campaign-name="reportTarget?.name"
    />
  </div>
</template>
