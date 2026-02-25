import type { EomRun, EomLineItem } from '~/types'

interface ItemFilters {
  client?: string
  confidence?: string
  reviewStatus?: string
  source?: string
  accountCode?: string
  page?: number
  limit?: number
}

interface ValidationCheck {
  name: string
  passed: boolean
  message: string
  severity: 'error' | 'warning' | 'info'
  details?: any
}

interface ValidationResult {
  checks: ValidationCheck[]
  flaggedItems: number
  passed: boolean
}

interface RunSummary {
  gstBreakdown: Array<{ taxType: string; count: number; total: number; percentage: number }>
  coaBreakdown: Array<{ accountCode: string; count: number; total: number }>
  clientBreakdown: Array<{ clientName: string; invoiceNumber: number | null; lineCount: number; total: number }>
  sourceBreakdown: Array<{ source: string; count: number; total: number }>
}

interface ContactValidation {
  matched: Array<{ clientName: string; xeroContactName: string; contactId: string }>
  unmatched: string[]
  total: number
}

interface PushResult {
  total: number
  created: number
  failed: number
  errors: Array<{ invoiceNumber: string; clientName: string; error: string }>
  batchId: string | null
}

export function useEom() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function generateRun(month: number, year: number): Promise<EomRun> {
    return await $fetch('/api/agency/eom/generate', { method: 'POST', body: { month, year } })
  }

  async function fetchRuns(year?: number): Promise<EomRun[]> {
    const params: any = {}
    if (year) params.year = year
    return await $fetch('/api/agency/eom/runs', { params })
  }

  async function fetchRun(id: string): Promise<EomRun> {
    return await $fetch(`/api/agency/eom/runs/${id}`)
  }

  async function deleteRun(id: string): Promise<void> {
    await $fetch(`/api/agency/eom/runs/${id}`, { method: 'DELETE' })
  }

  async function fetchItems(runId: string, filters: ItemFilters = {}): Promise<{ items: EomLineItem[]; total: number; page: number; pages: number }> {
    return await $fetch(`/api/agency/eom/runs/${runId}/items`, { params: filters as any })
  }

  async function updateItem(runId: string, itemId: string, changes: Partial<EomLineItem>): Promise<EomLineItem> {
    return await $fetch(`/api/agency/eom/runs/${runId}/items/${itemId}`, { method: 'PATCH', body: changes })
  }

  async function fetchValidation(runId: string): Promise<ValidationResult> {
    return await $fetch(`/api/agency/eom/runs/${runId}/validation`)
  }

  async function fetchSummary(runId: string): Promise<RunSummary> {
    return await $fetch(`/api/agency/eom/runs/${runId}/summary`)
  }

  async function validateContacts(runId: string): Promise<ContactValidation> {
    return await $fetch(`/api/agency/eom/runs/${runId}/validate-contacts`, { method: 'POST' })
  }

  async function pushToXero(runId: string): Promise<PushResult> {
    return await $fetch(`/api/agency/eom/runs/${runId}/push-to-xero`, { method: 'POST' })
  }

  async function fetchXeroStatus(runId: string) {
    return await $fetch(`/api/agency/eom/runs/${runId}/xero-status`)
  }

  async function exportCSV(runId: string) {
    const response = await $fetch(`/api/agency/eom/runs/${runId}/export-csv`, { responseType: 'blob' })
    const url = URL.createObjectURL(response as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `eom-invoices-${runId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function regenerateRun(runId: string): Promise<EomRun> {
    return await $fetch(`/api/agency/eom/runs/${runId}/regenerate`, { method: 'POST' })
  }

  async function archiveRun(runId: string) {
    return await $fetch(`/api/agency/eom/runs/${runId}/archive`, { method: 'POST' })
  }

  return {
    loading, error,
    generateRun, fetchRuns, fetchRun, deleteRun,
    fetchItems, updateItem,
    fetchValidation, fetchSummary,
    validateContacts, pushToXero, fetchXeroStatus,
    exportCSV, regenerateRun, archiveRun,
  }
}
