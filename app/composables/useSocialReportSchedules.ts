// app/composables/useSocialReportSchedules.ts
// CRUD data layer for the Slice 3 / 3c-2 scheduled-report management UI.
// Wraps /api/agency/social/reporting/schedules (list/create/patch/delete).
import type { Ref } from 'vue'

export interface ReportSchedule {
  id: string
  client_id: string
  name: string
  cadence: 'weekly' | 'monthly'
  recipients: string[]
  window_days: number
  platform: string | null
  sections: Record<string, unknown>
  enabled: boolean
  last_sent_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface ReportScheduleInput {
  name: string
  cadence: 'weekly' | 'monthly'
  recipients: string[]
  windowDays: number
  platform: string // 'all' | network key — mapped to null server-side
  enabled: boolean
}

const BASE = '/api/agency/social/reporting/schedules'

export function useSocialReportSchedules(clientId: Ref<string | null>) {
  const schedules = ref<ReportSchedule[]>([])
  const loading = ref(false)

  async function load() {
    if (!clientId.value) { schedules.value = []; return }
    loading.value = true
    try {
      schedules.value = await $fetch<ReportSchedule[]>(BASE, { query: { clientId: clientId.value } })
    } finally {
      loading.value = false
    }
  }

  async function create(input: ReportScheduleInput) {
    if (!clientId.value) return
    await $fetch(BASE, { method: 'POST', body: { clientId: clientId.value, ...input } })
    await load()
  }

  async function update(id: string, input: Partial<ReportScheduleInput>) {
    await $fetch(`${BASE}/${id}`, { method: 'PATCH', body: input })
    await load()
  }

  async function remove(id: string) {
    await $fetch(`${BASE}/${id}`, { method: 'DELETE' })
    await load()
  }

  /** Optimistic-then-confirmed enable/disable toggle. */
  async function setEnabled(id: string, enabled: boolean) {
    const row = schedules.value.find(s => s.id === id)
    if (row) row.enabled = enabled
    try {
      await $fetch(`${BASE}/${id}`, { method: 'PATCH', body: { enabled } })
    } catch (err) {
      if (row) row.enabled = !enabled // revert on failure
      throw err
    }
  }

  return { schedules, loading, load, create, update, remove, setEnabled }
}
