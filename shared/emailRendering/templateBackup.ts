export interface TemplateBackupMetadata {
  name: string
  subject: string
  preview_text: string
  template_kind: 'template' | 'draft'
  folder_name: string
}
export function readTemplateBackup(value: unknown): { metadata: TemplateBackupMetadata, document: unknown } | null {
  if (!value || typeof value !== 'object' || !('format' in value) || value.format !== 'xeroflow-email-template') return null
  const envelope = value as { version?: unknown, template?: unknown }
  if (envelope.version !== 1 || !envelope.template || typeof envelope.template !== 'object') throw new Error('Unsupported XeroFlow template backup.')
  const template = envelope.template as Record<string, unknown>
  const text = (key: string, max: number) => typeof template[key] === 'string' ? template[key].slice(0, max) : ''
  if (!template.body_source || typeof template.body_source !== 'object') throw new Error('This backup has no template document.')
  return { document: template.body_source, metadata: { name: text('name', 200), subject: text('subject', 300), preview_text: text('preview_text', 300), template_kind: template.template_kind === 'draft' ? 'draft' : 'template', folder_name: text('folder_name', 120) } }
}
