import type { AiAgentRun, AiAgentReport, AiAgentPreferences } from '~/types'

export function useAiAgent() {
  const toast = useToast()
  const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown }) => Promise<T>

  const runs = ref<AiAgentRun[]>([])
  const reports = ref<AiAgentReport[]>([])
  const preferences = ref<AiAgentPreferences>({
    dailyDigest: true,
    weeklyReport: true,
    anomalyAlerts: true,
    digestTime: '08:00',
    timezone: 'Australia/Melbourne',
    reportFocus: []
  })
  const loading = ref(false)

  async function fetchRuns() {
    loading.value = true
    try {
      const data = await $fetch('/api/agency/ai/agent/runs') as any
      runs.value = data?.runs || []
    } catch (e: any) {
      toast.add({ title: 'Failed to load runs', description: e.data?.statusMessage || e.message, color: 'error' })
    } finally {
      loading.value = false
    }
  }

  async function fetchReports(type?: string) {
    loading.value = true
    try {
      const query: Record<string, string> = {}
      if (type && type !== 'all') query.type = type
      const data = await $fetch('/api/agency/ai/agent/reports', { query }) as any
      reports.value = data?.reports || []
    } catch (e: any) {
      toast.add({ title: 'Failed to load reports', description: e.data?.statusMessage || e.message, color: 'error' })
    } finally {
      loading.value = false
    }
  }

  async function fetchReport(id: string): Promise<AiAgentReport | null> {
    try {
      const data = await $fetch(`/api/agency/ai/agent/reports/${id}`) as any
      return data?.report || data || null
    } catch (e: any) {
      toast.add({ title: 'Failed to load report', description: e.data?.statusMessage || e.message, color: 'error' })
      return null
    }
  }

  async function triggerRun(runType: string) {
    try {
      await $fetch('/api/agency/ai/agent/trigger', {
        method: 'POST',
        body: { runType }
      })
      toast.add({ title: 'Run triggered', description: `${runType.replace(/_/g, ' ')} started`, color: 'success' })
    } catch (e: any) {
      toast.add({ title: 'Failed to trigger run', description: e.data?.statusMessage || e.message, color: 'error' })
    }
  }

  async function fetchPreferences() {
    try {
      const data = await $fetch('/api/agency/ai/agent/preferences') as any
      if (data?.preferences) {
        preferences.value = data.preferences
      }
    } catch {
      // Use defaults if no preferences saved
    }
  }

  async function savePreferences() {
    try {
      await $fetch('/api/agency/ai/agent/preferences', {
        method: 'PUT',
        body: preferences.value
      })
      toast.add({ title: 'Preferences saved', color: 'success' })
    } catch (e: any) {
      toast.add({ title: 'Failed to save preferences', description: e.data?.statusMessage || e.message, color: 'error' })
    }
  }

  async function markReportRead(id: string) {
    try {
      await apiFetch(`/api/agency/ai/agent/reports/${id}`, {
        method: 'PATCH',
        body: { isRead: true }
      })
      const report = reports.value.find(r => r.id === id)
      if (report) report.isRead = true
    } catch {
      // Silent fail for read tracking
    }
  }

  return {
    runs,
    reports,
    preferences,
    loading,
    fetchRuns,
    fetchReports,
    fetchReport,
    triggerRun,
    fetchPreferences,
    savePreferences,
    markReportRead
  }
}
