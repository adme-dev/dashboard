export interface MuapiWebhookClassification {
  outcome: 'succeeded' | 'failed' | 'pending'
  outputUrl: string | null
  actualCostCents: number | null
  errorMessage: string | null
}

/** Classify a muapi webhook payload. Non-terminal events (e.g. 'processing') are
 *  'pending' and must NOT fail the job — only explicit failure statuses do. */
export function classifyMuapiWebhook(payload: any): MuapiWebhookClassification {
  const status = String(payload?.status ?? 'processing')
  const isSuccess = status === 'completed' || status === 'succeeded' || status === 'success'
  const isFailure = status === 'failed' || status === 'error' || status === 'canceled'
  const outputUrl = payload?.outputs?.[0] ?? payload?.output_url ?? payload?.url ?? null
  const actualCostCents = typeof payload?.cost === 'number' ? Math.round(payload.cost * 100) : null
  const errText = payload?.error == null ? null : (typeof payload.error === 'string' ? payload.error : (payload.error.message ?? JSON.stringify(payload.error)))
  if (isSuccess) {
    if (!outputUrl) return { outcome: 'failed', outputUrl: null, actualCostCents, errorMessage: 'succeeded with no output URL' }
    return { outcome: 'succeeded', outputUrl, actualCostCents, errorMessage: null }
  }
  if (isFailure) return { outcome: 'failed', outputUrl: null, actualCostCents, errorMessage: errText ?? `provider status ${status}` }
  return { outcome: 'pending', outputUrl: null, actualCostCents: null, errorMessage: null }
}
