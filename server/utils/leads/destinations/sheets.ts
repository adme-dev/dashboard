// server/utils/leads/destinations/sheets.ts
import { registerAdapter } from './registry'
import { queryOne } from '~~/server/utils/db'
import type { DestinationAdapter } from './types'

interface Cfg { spreadsheet_id: string; sheet_name: string }

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

async function loadGoogleAccessToken(): Promise<{ token: string | null; hasScope: boolean }> {
  // Pulls from social_connections.platform='google'. Returns the first active row's token.
  const row = await queryOne<{ access_token: string; scopes: string[] }>(`
    SELECT access_token, scopes FROM social_connections
    WHERE platform = 'google' AND status = 'active' AND access_token IS NOT NULL
    ORDER BY updated_at DESC LIMIT 1
  `)
  if (!row) return { token: null, hasScope: false }
  return { token: row.access_token, hasScope: (row.scopes ?? []).includes(SHEETS_SCOPE) }
}

const adapter: DestinationAdapter<Cfg> = {
  type: 'sheets',
  validateConfig(config) {
    const errors: Record<string, string> = {}
    const c = config as Cfg
    if (!c?.spreadsheet_id || c.spreadsheet_id.length < 20) errors.spreadsheet_id = 'Looks invalid'
    if (!c?.sheet_name) errors.sheet_name = 'Required'
    return Object.keys(errors).length ? { valid: false, errors } : { valid: true }
  },
  async dispatch(_delivery, lead, config) {
    const { token, hasScope } = await loadGoogleAccessToken()
    if (!token) return { status: 'failed', error: 'no_google_connection' }
    if (!hasScope) {
      return { status: 'failed', error: 'missing_scope:reconnect_google_with_spreadsheets_scope' }
    }
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheet_id)}/values/${encodeURIComponent(config.sheet_name)}!A:Z:append?valueInputOption=RAW`
    const row = [
      lead.submitted_at, lead.source, lead.form_name ?? lead.form_id ?? '',
      lead.field_data?.full_name ?? '', lead.field_data?.email ?? '',
      lead.field_data?.phone_number ?? lead.field_data?.phone ?? '',
      JSON.stringify(lead.field_data ?? {}),
    ]
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 30_000)
      let resp: Response
      try {
        resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [row] }),
          signal: ctrl.signal,
        })
      } finally { clearTimeout(timer) }
      if (!resp.ok) {
        return { status: 'failed', error: `sheets_http_${resp.status}` }
      }
      return { status: 'delivered', response_meta: { http_status: resp.status } }
    } catch (e: any) {
      return { status: 'failed', error: `sheets_network: ${e?.message ?? String(e)}` }
    }
  },
}

registerAdapter(adapter)
export default adapter
