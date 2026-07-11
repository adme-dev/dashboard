import type { EscalationSeverity } from '~~/app/utils/escalationDisplay'

export interface AutomationEscalation {
  id: string
  capability: string
  title: string
  severity: EscalationSeverity
  client_id: string | null
  run_id: string | null
  detail: Record<string, any>
  proposed_action: Record<string, any> | null
  status: string
  created_at: string
}

export interface AutomationEscalationGroup {
  severity: EscalationSeverity
  clientId: string | null
  items: AutomationEscalation[]
}

interface EscalationListResponse {
  groups: AutomationEscalationGroup[]
  count: number
}

/**
 * Loads the pending automation escalations and records human decisions.
 * Read via a local fetch wrapper; decisions use the same wrapper, then refetch.
 */
export async function useAutomationEscalations() {
  const toast = useToast()
  const deciding = ref<string | null>(null)
  const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

  const data = ref<EscalationListResponse>({ groups: [], count: 0 })
  const pending = ref(false)
  const error = ref<unknown>(null)

  async function refresh() {
    pending.value = true
    error.value = null
    try {
      data.value = await apiFetch<EscalationListResponse>('/api/agency/automation/escalations')
    } catch (err) {
      error.value = err
      data.value = { groups: [], count: 0 }
    } finally {
      pending.value = false
    }
  }

  await refresh()

  const groups = computed<AutomationEscalationGroup[]>(() => data.value?.groups ?? [])
  const count = computed<number>(() => data.value?.count ?? 0)

  async function decide(id: string, decision: 'approved' | 'rejected', note?: string): Promise<boolean> {
    deciding.value = id
    try {
      await apiFetch(`/api/agency/automation/escalations/${id}/decide`, {
        method: 'POST',
        body: { decision, note },
      })
      toast.add({
        title: decision === 'approved' ? 'Approved' : 'Rejected',
        color: decision === 'approved' ? 'success' : 'neutral',
      })
      await refresh()
      return true
    } catch (err: any) {
      toast.add({
        title: 'Couldn’t record your decision',
        description: err?.data?.statusMessage || err?.data?.message || err?.message || 'Please try again.',
        color: 'error',
      })
      return false
    } finally {
      deciding.value = null
    }
  }

  return { groups, count, pending, error, refresh, decide, deciding }
}
