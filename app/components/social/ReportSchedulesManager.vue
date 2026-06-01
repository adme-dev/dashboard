<script setup lang="ts">
// Slice 3 / 3c-2 — scheduled-report management UI.
// Lists a client's report schedules and edits them (name / cadence / window / platform /
// recipients / enabled) against /api/agency/social/reporting/schedules. The "Preview" action
// hits the ungated preview endpoint (human-initiated, no email). Scheduled SENDING stays behind
// the operator's SOCIAL_REPORTS_ENABLED gate — surfaced here as an honest dormant notice.
import { useSocialReportSchedules, type ReportSchedule, type ReportScheduleInput } from '~/composables/useSocialReportSchedules'
import { parseRecipients, scheduleSummary, SOCIAL_PLATFORM_FILTER_OPTIONS } from '~~/app/utils/socialReportScheduleForm'

const props = defineProps<{
  open: boolean
  clientId: string | null
  clientName?: string
}>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const toast = useToast()
const clientIdRef = computed(() => props.clientId)
const { schedules, loading, load, create, update, remove, setEnabled } = useSocialReportSchedules(clientIdRef)

const localOpen = computed({
  get: () => props.open,
  set: (v: boolean) => emit('update:open', v),
})

const cadenceOptions = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
]
const windowOptions = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 14 days', value: 14 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 60 days', value: 60 },
  { label: 'Last 90 days', value: 90 },
]
const platformOptions = SOCIAL_PLATFORM_FILTER_OPTIONS

type Mode = 'list' | 'edit'
const mode = ref<Mode>('list')
const editingId = ref<string | null>(null) // null while creating

const form = reactive<ReportScheduleInput>({
  name: '', cadence: 'monthly', recipients: [], windowDays: 30, platform: 'all', enabled: true,
})
const recipientsRaw = ref('')
const parsedRecipients = computed(() => parseRecipients(recipientsRaw.value))
const hasInvalidRecipients = computed(() =>
  recipientsRaw.value.trim().length > 0 && parsedRecipients.value.length === 0)

const saving = ref(false)
const pendingDelete = ref<ReportSchedule | null>(null)
const deleting = ref(false)

function startCreate() {
  editingId.value = null
  form.name = ''
  form.cadence = 'monthly'
  form.windowDays = 30
  form.platform = 'all'
  form.enabled = true
  recipientsRaw.value = ''
  mode.value = 'edit'
}

function startEdit(s: ReportSchedule) {
  editingId.value = s.id
  form.name = s.name
  form.cadence = s.cadence
  form.windowDays = s.window_days
  form.platform = s.platform ?? 'all'
  form.enabled = s.enabled
  recipientsRaw.value = (s.recipients ?? []).join(', ')
  mode.value = 'edit'
}

function backToList() {
  mode.value = 'list'
  editingId.value = null
}

async function save() {
  if (!form.name.trim()) {
    toast.add({ title: 'Name required', description: 'Give the schedule a name.', color: 'error' })
    return
  }
  saving.value = true
  const payload: ReportScheduleInput = { ...form, recipients: parsedRecipients.value }
  try {
    if (editingId.value) await update(editingId.value, payload)
    else await create(payload)
    toast.add({ title: editingId.value ? 'Schedule updated' : 'Schedule created', color: 'success' })
    backToList()
  } catch {
    toast.add({ title: 'Could not save schedule', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function onToggle(s: ReportSchedule, enabled: boolean) {
  try {
    await setEnabled(s.id, enabled)
  } catch {
    toast.add({ title: 'Could not update schedule', color: 'error' })
  }
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  try {
    await remove(pendingDelete.value.id)
    toast.add({ title: 'Schedule deleted', color: 'success' })
    pendingDelete.value = null
  } catch {
    toast.add({ title: 'Could not delete schedule', color: 'error' })
  } finally {
    deleting.value = false
  }
}

function openPreview() {
  if (!props.clientId) return
  const q = new URLSearchParams({
    clientId: props.clientId,
    days: String(form.windowDays),
    platform: form.platform,
    summary: '1',
  })
  window.open(`/api/agency/social/reporting/preview?${q.toString()}`, '_blank', 'noopener')
}

function fmtSent(s: ReportSchedule) {
  if (s.last_error) return `Last attempt failed`
  if (!s.last_sent_at) return 'Never sent'
  return `Last sent ${new Date(s.last_sent_at).toLocaleDateString()}`
}

// Reload whenever the slideover opens or the client changes.
watch(() => [props.open, props.clientId], ([isOpen]) => {
  if (isOpen) { backToList(); load() }
})
</script>

<template>
  <USlideover v-model:open="localOpen" title="Scheduled reports" :description="clientName ? `Email reports for ${clientName}` : undefined">
    <template #body>
      <div class="space-y-4">
        <UAlert
          icon="i-lucide-clock"
          color="neutral"
          variant="subtle"
          title="Scheduled sending is operator-gated"
          description="Schedules are saved now, but emails only go out once an operator enables scheduled reports. Use Preview to view the document any time."
        />

        <!-- LIST -->
        <template v-if="mode === 'list'">
          <div v-if="loading" class="text-sm text-muted">Loading…</div>

          <template v-else>
            <div v-if="schedules.length" class="space-y-2">
              <div
                v-for="s in schedules"
                :key="s.id"
                class="rounded-lg border border-default bg-default p-3 flex items-start gap-3"
              >
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="font-medium truncate">{{ s.name }}</p>
                    <UBadge v-if="!s.enabled" color="neutral" variant="subtle" size="xs">Paused</UBadge>
                  </div>
                  <p class="text-xs text-muted mt-0.5">{{ scheduleSummary(s) }}</p>
                  <p class="text-xs mt-1" :class="s.last_error ? 'text-error' : 'text-muted'">{{ fmtSent(s) }}</p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <USwitch
                    :model-value="s.enabled"
                    aria-label="Toggle schedule"
                    @update:model-value="(v: boolean) => onToggle(s, v)"
                  />
                  <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" aria-label="Edit" @click="startEdit(s)" />
                  <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="Delete" @click="pendingDelete = s" />
                </div>
              </div>
            </div>

            <div v-else class="rounded-lg border border-dashed border-default p-6 text-center">
              <UIcon name="i-lucide-calendar-clock" class="text-muted size-6 mx-auto" />
              <p class="text-sm text-muted mt-2">No report schedules yet.</p>
            </div>
          </template>
        </template>

        <!-- EDITOR -->
        <template v-else>
          <UFormField label="Name" required>
            <UInput v-model="form.name" placeholder="e.g. Monthly performance recap" class="w-full" />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Cadence">
              <USelectMenu v-model="form.cadence" :items="cadenceOptions" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Reporting window">
              <USelectMenu v-model="form.windowDays" :items="windowOptions" value-key="value" class="w-full" />
            </UFormField>
          </div>

          <UFormField label="Networks">
            <USelectMenu v-model="form.platform" :items="platformOptions" value-key="value" class="w-full" />
          </UFormField>

          <UFormField
            label="Recipients"
            :help="hasInvalidRecipients ? undefined : 'Separate addresses with commas, spaces or new lines.'"
            :error="hasInvalidRecipients ? 'No valid email addresses found.' : undefined"
          >
            <UTextarea v-model="recipientsRaw" :rows="3" placeholder="client@example.com, manager@example.com" class="w-full" />
          </UFormField>
          <div v-if="parsedRecipients.length" class="flex flex-wrap gap-1.5 -mt-2">
            <UBadge v-for="r in parsedRecipients" :key="r" color="primary" variant="subtle" size="sm">{{ r }}</UBadge>
          </div>

          <UFormField label="Enabled" help="Paused schedules are skipped by the cron.">
            <USwitch v-model="form.enabled" />
          </UFormField>
        </template>
      </div>
    </template>

    <template #footer="{ close }">
      <div class="flex items-center justify-between w-full">
        <UButton
          v-if="mode === 'edit'"
          icon="i-lucide-eye"
          color="neutral"
          variant="ghost"
          label="Preview"
          :disabled="!clientId"
          @click="openPreview"
        />
        <span v-else />
        <div class="flex gap-2">
          <template v-if="mode === 'list'">
            <UButton variant="ghost" color="neutral" label="Close" @click="close" />
            <UButton icon="i-lucide-plus" color="primary" label="New schedule" :disabled="!clientId" @click="startCreate" />
          </template>
          <template v-else>
            <UButton variant="ghost" color="neutral" label="Cancel" @click="backToList" />
            <UButton color="primary" label="Save" :loading="saving" @click="save" />
          </template>
        </div>
      </div>
    </template>
  </USlideover>

  <!-- Delete confirmation (no native confirm) -->
  <UModal :open="!!pendingDelete" title="Delete schedule" @update:open="(v: boolean) => { if (!v) pendingDelete = null }">
    <template #body>
      <p class="text-sm">
        Delete <span class="font-medium">{{ pendingDelete?.name }}</span>? This can't be undone.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" color="neutral" label="Cancel" @click="pendingDelete = null" />
        <UButton color="error" label="Delete" :loading="deleting" @click="confirmDelete" />
      </div>
    </template>
  </UModal>
</template>
