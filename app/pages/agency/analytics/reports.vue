<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-media'] })

interface ClientOption { id: string, name: string }
interface Schedule {
  id: string
  client_id: string | null
  client_name: string | null
  cadence: 'weekly' | 'monthly'
  recipients: string[]
  enabled: boolean
  last_run_at: string | null
  last_status: string | null
  last_report_url: string | null
}

const toast = useToast()
const AGENCY = '__agency__'

const { data: clientsData } = await useLazyFetch<ClientOption[]>('/api/agency/clients')
const { data: schedulesData, refresh, pending } = await useFetch<{ schedules: Schedule[] }>('/api/agency/analytics/report-schedules')
const schedules = computed(() => schedulesData.value?.schedules ?? [])

const clientItems = computed(() => [
  { label: 'All clients (agency-wide)', value: AGENCY },
  ...(clientsData.value ?? []).map(c => ({ label: c.name, value: c.id }))
])
const cadenceItems = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' }
]

const form = reactive({
  clientValue: AGENCY,
  cadence: 'weekly' as 'weekly' | 'monthly',
  recipients: '',
  agencyName: '',
  accentColor: ''
})
const creating = ref(false)

async function createSchedule() {
  const recipients = form.recipients.split(',').map(r => r.trim()).filter(Boolean)
  if (recipients.length === 0) {
    toast.add({ title: 'Add at least one recipient email', color: 'error' })
    return
  }
  creating.value = true
  try {
    const branding: Record<string, string> = {}
    if (form.agencyName.trim()) branding.agencyName = form.agencyName.trim()
    if (form.accentColor.trim()) branding.accentColor = form.accentColor.trim()
    await $fetch('/api/agency/analytics/report-schedules', {
      method: 'POST',
      body: {
        clientId: form.clientValue === AGENCY ? null : form.clientValue,
        cadence: form.cadence,
        recipients,
        branding
      }
    })
    toast.add({ title: 'Schedule created', color: 'success' })
    form.recipients = ''
    form.agencyName = ''
    form.accentColor = ''
    await refresh()
  } catch (e: unknown) {
    toast.add({ title: 'Failed to create schedule', description: (e as { statusMessage?: string })?.statusMessage, color: 'error' })
  } finally {
    creating.value = false
  }
}

async function toggleEnabled(s: Schedule) {
  try {
    await $fetch(`/api/agency/analytics/report-schedules/${s.id}`, { method: 'PATCH', body: { enabled: !s.enabled } })
    await refresh()
  } catch {
    toast.add({ title: 'Failed to update', color: 'error' })
  }
}

const sendingId = ref<string | null>(null)
async function sendNow(s: Schedule) {
  sendingId.value = s.id
  try {
    const res = await $fetch<{ status: string }>(`/api/agency/analytics/report-schedules/${s.id}/send`, { method: 'POST' })
    toast.add({ title: `Report ${res.status}`, color: res.status === 'success' ? 'success' : 'warning' })
    await refresh()
  } catch {
    toast.add({ title: 'Failed to send report', color: 'error' })
  } finally {
    sendingId.value = null
  }
}

async function remove(s: Schedule) {
  try {
    await $fetch(`/api/agency/analytics/report-schedules/${s.id}`, { method: 'DELETE' })
    toast.add({ title: 'Schedule deleted', color: 'success' })
    await refresh()
  } catch {
    toast.add({ title: 'Failed to delete', color: 'error' })
  }
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never'
}
function statusColor(status: string | null): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'success') return 'success'
  if (status === 'partial') return 'warning'
  if (status === 'failed') return 'error'
  return 'neutral'
}
</script>

<template>
  <div class="p-6 space-y-6">
    <div>
      <h1 class="text-xl font-semibold">
        Scheduled Reports
      </h1>
      <p class="text-sm text-muted">
        White-label performance reports emailed to clients on a cadence. Reports are archived and sent as HTML.
      </p>
    </div>

    <UCard>
      <template #header>
        <span class="font-semibold">New schedule</span>
      </template>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UFormField label="Client">
          <USelectMenu
            v-model="form.clientValue"
            :items="clientItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Cadence">
          <USelect
            v-model="form.cadence"
            :items="cadenceItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Recipients" help="Comma-separated email addresses" class="md:col-span-2">
          <UInput v-model="form.recipients" placeholder="client@example.com, manager@example.com" class="w-full" />
        </UFormField>
        <UFormField label="Agency name (branding)">
          <UInput v-model="form.agencyName" placeholder="Your Agency" class="w-full" />
        </UFormField>
        <UFormField label="Accent colour (hex)">
          <UInput v-model="form.accentColor" placeholder="#4f46e5" class="w-full" />
        </UFormField>
      </div>
      <template #footer>
        <UButton
          :loading="creating"
          label="Create schedule"
          icon="i-lucide-plus"
          @click="createSchedule"
        />
      </template>
    </UCard>

    <UCard>
      <template #header>
        <span class="font-semibold">Schedules</span>
      </template>
      <div v-if="pending" class="text-sm text-muted">
        Loading…
      </div>
      <div v-else-if="schedules.length === 0" class="text-sm text-muted">
        No schedules yet.
      </div>
      <div v-else class="divide-y divide-default">
        <div v-for="s in schedules" :key="s.id" class="flex items-center gap-4 py-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium truncate">{{ s.client_name || 'All clients' }}</span>
              <UBadge size="xs" variant="subtle" :label="s.cadence" />
              <UBadge
                v-if="s.last_status"
                size="xs"
                :color="statusColor(s.last_status)"
                variant="subtle"
                :label="s.last_status"
              />
            </div>
            <p class="text-xs text-muted truncate">
              {{ s.recipients.join(', ') }} · last run {{ fmtDate(s.last_run_at) }}
            </p>
          </div>
          <USwitch :model-value="s.enabled" @update:model-value="toggleEnabled(s)" />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-send"
            :loading="sendingId === s.id"
            label="Send now"
            @click="sendNow(s)"
          />
          <UButton
            size="xs"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            @click="remove(s)"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
