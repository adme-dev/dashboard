import { gtmHash } from './gtmOwnership'

/** Preserve exact content identities while keeping existing scripts and configuration secrets out of review. */
export function safeGtmConfiguration(value: any, key = ''): any {
  if (value instanceof Date) return value.toISOString()
  // This server-generated digest identifies the installation key without exposing it.
  if (key === 'writeKeyHash' && typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)) return value
  if (typeof value === 'string' && (/[<>]|data-key=/.test(value) || /token|secret|write.?key|html/i.test(key)))
    return { redacted: true, sha256: gtmHash(value), length: value.length }
  if (Array.isArray(value)) return value.map(item => safeGtmConfiguration(item))
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, safeGtmConfiguration(v, k === 'value' ? value.key ?? k : k)]))
  return value
}
/** Outward proposal contract only. Never use this view to construct, hash or execute an intent. */
export function gtmProposalProjection(row: any) {
  return safeGtmConfiguration({ ...row, review: gtmReviewProjection(row) })
}
export function gtmVersionReview(version: any) {
  return { path: version.path, fingerprint: version.fingerprint, configuration: safeGtmConfiguration(version) }
}
export function gtmReplacementChanges(before: any, after: any) {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)].filter(k => Array.isArray(before[k]) || Array.isArray(after[k])))
  const changes: any[] = []
  const content = (entity: any) => entity == null ? null : Object.fromEntries(Object.entries(entity).filter(([k]) => !['path', 'fingerprint', 'accountId', 'containerId', 'workspaceId', 'tagManagerUrl'].includes(k)))
  for (const field of fields) {
    const id = (e: any) => String(e[field === 'customTemplate' ? 'templateId' : `${field}Id`] ?? e.name ?? gtmHash(e))
    const left = new Map((before[field] ?? []).map((e: any) => [id(e), e]))
    const right = new Map((after[field] ?? []).map((e: any) => [id(e), e]))
    for (const key of new Set([...left.keys(), ...right.keys()])) {
      const a: any = left.get(key), b: any = right.get(key)
      if (gtmHash(content(a)) !== gtmHash(content(b))) changes.push({
        kind: field, id: key, name: b?.name ?? a?.name ?? key,
        action: !a ? 'create' : !b ? 'remove' : 'update',
        before: safeGtmConfiguration(content(a)), after: safeGtmConfiguration(content(b))
      })
    }
  }
  return changes
}
export function gtmReviewProjection(row: any) {
  return row.desired_state?.review ?? {
    action: row.action_type, base: { path: row.base_live_path, fingerprint: row.base_live_fingerprint },
    target: null, changes: [], unavailable: 'This older proposal has no exact review projection. Prepare a new proposal.'
  }
}
