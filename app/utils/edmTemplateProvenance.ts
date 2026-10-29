import { redactTemplateProvenance } from '~~/shared/emailRendering/templateProvenance'
import type { EdmFlyhubDocument } from '~~/app/types/edm'

export interface TemplateSourceDetails {
  provider: string
  make: string
  assetId: string
  retrievedAt: string
  originalSha256: string
  sourceUrl: string | null
  notes: string
  formatLabel: string
  requiresReview: true
}
function documentValue(value: unknown): EdmFlyhubDocument | null {
  try {
    const document = (typeof value === 'string' ? JSON.parse(value) : value) as EdmFlyhubDocument | null
    return document && typeof document === 'object' && !Array.isArray(document) && document.root?.type === 'EmailLayout' ? document : null
  } catch { return null }
}
// Provenance comes from an imported document, not an approval authority. Display
// it as recorded source information; never promote its approvalState to a badge.
export function templateSourceDetails(value: unknown): TemplateSourceDetails | null {
  const source = documentValue(value)?.root?.data?.props?.sourceProvenance
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null
  const recorded = source as Record<string, unknown>
  const text = (key: string, limit = 200) => {
    const value = recorded[key]
    return typeof value === 'string' ? value.trim().slice(0, limit) : ''
  }
  if (!text('provider') && !text('make')) return null
  let sourceUrl: string | null = null
  try {
    const url = new URL(text('sourceUrl', 2048))
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && /^[a-z0-9-]+\.sesimi\.app$/.test(url.hostname) && url.pathname.startsWith('/assets/')) {
      url.search = ''
      url.hash = ''
      sourceUrl = url.toString()
    }
  } catch { /* Unrecognised source URLs remain plain metadata, never links. */ }
  const hash = text('originalSha256')
  return {
    provider: text('provider'), make: text('make'), assetId: text('assetId'),
    retrievedAt: /^\d{4}-\d{2}-\d{2}$/.test(text('retrievedAt')) ? text('retrievedAt') : '',
    originalSha256: /^[a-f0-9]{64}$/i.test(hash) ? hash : '', sourceUrl,
    notes: text('notes', 2000), formatLabel: text('importForm') === 'flattened-html-snapshot' ? 'HTML snapshot' : 'Imported HTML', requiresReview: true
  }
}
export function buildTemplateExport(name: string, value: unknown, metadata?: { subject?: string | null, preview_text?: string | null, template_kind?: string | null, folder_name?: string | null }): { filename: string, content: string } {
  const document = documentValue(value) as EdmFlyhubDocument | null
  if (!document || !Array.isArray(document.root.data?.childrenIds)) throw new Error('This template has no exportable document.')
  const portable = redactTemplateProvenance(document)
  delete portable.root.data.props?.importReceipt
  const content = JSON.stringify({ format: 'xeroflow-email-template', version: 1, template: { name: name.slice(0, 200), subject: metadata?.subject ?? '', preview_text: metadata?.preview_text ?? '', template_kind: metadata?.template_kind === 'draft' ? 'draft' : 'template', folder_name: metadata?.folder_name ?? '', body_source: portable } }, null, 2)
  if (new TextEncoder().encode(content).byteLength > 512 * 1024) throw new Error('This document exceeds the 512 KB import limit.')
  const filename = (name.normalize('NFKC').replace(/[^\p{L}\p{N}_. -]+/gu, '-').replace(/[\s-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 100) || 'email-template') + '.json'
  return { filename, content }
}

export function templateCopyCategory(value: unknown, existing?: string | null): string {
  const source = templateSourceDetails(value)
  return source ? `Client templates${source.make ? ' / ' + source.make.slice(0, 100) : ''}` : existing?.trim() || 'Client templates'
}

// Lineage is an editing aid, never an authorisation or OEM-approval decision.
export function isTemplateClientCopy(value: unknown): boolean {
  const lineage = documentValue(value)?.root?.data?.props?.clientCopyOf as { templateId?: unknown } | undefined
  return !!lineage && typeof lineage === 'object' && typeof lineage.templateId === 'string' && lineage.templateId.length > 0
}
export function markTemplateClientCopy(value: unknown, sourceId: string): unknown {
  const document = documentValue(value)
  if (!document) return value
  const copy = redactTemplateProvenance(document)
  delete copy.root.data.props?.importReceipt
  copy.root.data.props = { ...copy.root.data.props, clientCopyOf: { templateId: sourceId, copiedAt: new Date().toISOString() } }
  return copy
}
export function templateCopyName(name: string): string {
  return `${name.replace(/^(?:Copy of )+/i, '').replace(/(?: \(copy\))+$/i, '').slice(0, 190)} (copy)`
}
