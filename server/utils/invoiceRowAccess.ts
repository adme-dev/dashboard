import { createError } from 'h3'
import { queryOneFresh } from './db'
import type { requireInvoiceAccess } from './clientScoping'

type InvoiceAccess = Awaited<ReturnType<typeof requireInvoiceAccess>>
type InvoiceRow = { id: string, client_id: string, status: string, created_by: string, [key: string]: unknown }
type InvoiceDb = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }

/** Scope before exposing parent or child invoice data; invoice authority comes from fresh grants. */
export async function assertInvoiceRowAccess(id: string, access: InvoiceAccess, write = false): Promise<InvoiceRow> {
  const invoice = await queryOneFresh<InvoiceRow>('SELECT * FROM invoices WHERE id = $1', [id])
  if (!invoice) throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })
  if (access.clientIds !== 'all' && (
    !access.clientIds.includes(invoice.client_id)
    || (write && (invoice.status !== 'draft' || invoice.created_by !== access.user.id))
  )) throw createError({ statusCode: 403, statusMessage: 'Invoice access denied' })
  return invoice
}

/** Lock the parent before child writes, rechecking own-draft and current assignment atomically. */
export async function lockInvoiceForEdit(db: InvoiceDb, id: string, access: InvoiceAccess): Promise<InvoiceRow> {
  const scoped = access.clientIds !== 'all'
  const result = await db.query(`
    SELECT i.* FROM invoices i
    WHERE i.id = $1 ${scoped
      ? `AND i.status = 'draft' AND i.created_by = $2
      AND EXISTS (SELECT 1 FROM client_team_assignments cta
        JOIN agency_clients c ON c.id = cta.client_id
        WHERE cta.client_id = i.client_id AND cta.team_member_id = $2 AND c.is_active = TRUE)`
      : ''}
    FOR UPDATE OF i`, scoped ? [id, access.user.id] : [id])
  const invoice = result.rows[0] as InvoiceRow | undefined
  if (!invoice) throw createError({ statusCode: scoped ? 403 : 404, statusMessage: 'Invoice unavailable for editing' })
  if (['paid', 'cancelled'].includes(invoice.status)) {
    throw createError({ statusCode: 400, statusMessage: `Cannot edit ${invoice.status} invoice` })
  }
  return invoice
}

/** Scoped staff can only keep drafts and move them within their assigned client book. */
export function assertInvoiceDraftChanges(access: InvoiceAccess, body: { clientId?: string, status?: string }) {
  if (access.clientIds === 'all') return
  if ((body.status !== undefined && body.status !== 'draft')
    || (body.clientId !== undefined && !access.clientIds.includes(body.clientId))) {
    throw createError({ statusCode: 403, statusMessage: 'Only assigned-client draft invoices may be edited' })
  }
}

/** A scoped draft must not import another client's project or time-entry details. */
export async function assertInvoiceReferences(db: InvoiceDb, clientId: string, refs: { projectId?: string | null, timeEntryId?: string | null }) {
  if (refs.projectId) {
    const result = await db.query('SELECT id FROM projects WHERE id = $1 AND client_id = $2', [refs.projectId, clientId])
    if (!result.rows[0]) throw createError({ statusCode: 403, statusMessage: 'Project is outside the invoice client' })
  }
  if (refs.timeEntryId) {
    const result = await db.query(`SELECT te.id FROM time_entries te
      JOIN projects p ON p.id = te.project_id WHERE te.id = $1 AND p.client_id = $2`, [refs.timeEntryId, clientId])
    if (!result.rows[0]) throw createError({ statusCode: 403, statusMessage: 'Time entry is outside the invoice client' })
  }
}

/** Recheck a scoped creator's live assignment inside the invoice creation transaction. */
export async function assertInvoiceClientAssignment(db: InvoiceDb, clientId: string, userId: string) {
  const result = await db.query(`SELECT cta.client_id FROM client_team_assignments cta
    JOIN agency_clients c ON c.id = cta.client_id
    WHERE cta.team_member_id = $1 AND cta.client_id = $2 AND c.is_active = TRUE
    FOR SHARE OF cta, c`, [userId, clientId])
  if (!result.rows[0]) throw createError({ statusCode: 403, statusMessage: 'Client access denied' })
}
