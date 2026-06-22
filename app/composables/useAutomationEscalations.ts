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
 * Read via useFetch (SSR-friendly); decisions via $fetch + toast, then refetch.
 */
export function useAutomationEscalations() {
  const toast = useToast()
  const deciding = ref<string | null>(null)

  const { data, pending, error, refresh } = useFetch<EscalationListResponse>(
    '/api/agency/automation/escalations',
    { default: () => ({ groups: [], count: 0 }) },
  )

  const groups = computed<AutomationEscalationGroup[]>(() => data.value?.groups ?? [])
  const count = computed<number>(() => data.value?.count ?? 0)

  async function decide(id: string, decision: 'approved' | 'rejected', note?: string): Promise<boolean> {
    deciding.value = id
    try {
      await $fetch(`/api/agency/automation/escalations/${id}/decide`, {
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
