// Tiny mustache-like renderer for {{ field.x }} / {{ attribution.x }} / {{ scalar }}.
// Returns warnings for missing keys so callers can log without throwing.

import type { Lead } from '~~/app/types'

export interface RenderResult {
  text: string
  warnings: string[]
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function resolve(lead: Lead, path: string): string | undefined {
  // Special prefix: 'field.x' → field_data.x for ergonomic templates.
  const norm = path.startsWith('field.') ? `field_data.${path.slice(6)}` : path
  const parts = norm.split('.')
  let cur: any = lead
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  if (cur === undefined || cur === null) return undefined
  return typeof cur === 'string' ? cur : String(cur)
}

export interface RenderOptions {
  html?: boolean
}

export function renderTemplate(
  template: string,
  lead: Lead,
  opts: RenderOptions = {},
): RenderResult {
  const warnings: string[] = []
  const text = template.replace(TOKEN, (_match, path: string) => {
    const v = resolve(lead, path)
    if (v === undefined) {
      warnings.push(path)
      return ''
    }
    return opts.html ? escapeHtml(v) : v
  })
  return { text, warnings }
}
