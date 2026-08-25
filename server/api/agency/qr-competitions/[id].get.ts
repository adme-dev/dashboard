import { queryRows, queryOne } from '~~/server/utils/db'
import { requireCompetitionAccess } from '~~/server/utils/qr/competitions'

export default defineEventHandler(async (event) => {
  const { row } = await requireCompetitionAccess(event, getRouterParam(event, 'id'))
  const [terms, documents, draws, stats, pages, client] = await Promise.all([
    queryRows<any>(`SELECT id, version, sha256, created_by, created_at, terms_md FROM qr_competition_terms_versions WHERE competition_id = $1 ORDER BY version DESC`, [row.id]),
    queryRows<any>(`SELECT d.*, u.name AS uploaded_by_name FROM qr_competition_documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.competition_id = $1 AND d.deleted_at IS NULL ORDER BY d.uploaded_at DESC`, [row.id]),
    queryRows<any>(`SELECT d.*, u.name AS drawn_by_name FROM qr_competition_draws d LEFT JOIN users u ON u.id = d.drawn_by WHERE d.competition_id = $1 ORDER BY drawn_at DESC`, [row.id]),
    queryOne<any>(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'valid')::int AS valid, COUNT(*) FILTER (WHERE status = 'disqualified')::int AS disqualified, COUNT(*) FILTER (WHERE status = 'winner')::int AS winners, COUNT(DISTINCT entrant_hash)::int AS people FROM qr_competition_entries WHERE competition_id = $1`, [row.id]),
    queryRows<any>(`SELECT p.id, p.is_published, c.code, c.name AS code_name FROM qr_pages p JOIN qr_codes c ON c.id = p.qr_code_id WHERE p.competition_id = $1`, [row.id]),
    queryOne<{ name: string }>(`SELECT name FROM agency_clients WHERE id = $1`, [row.client_id])
  ])
  return { competition: { ...row, client_name: client?.name ?? null }, terms, documents, draws, stats, pages }
})
