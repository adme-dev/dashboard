import { queryRows, queryOne } from '~~/server/utils/db'
import { requireCompetitionAccess } from '~~/server/utils/qr/competitions'

interface CompetitionTermVersion {
  id: string
  version: number
  sha256: string
  created_by: string | null
  created_at: string
  terms_md: string
}

interface CompetitionDocument {
  id: string
  competition_id: string
  kind: string
  state: string | null
  title: string
  storage_key: string
  sha256: string
  size_bytes: number
  content_type: string
  uploaded_by: string | null
  uploaded_at: string
  deleted_at: string | null
  deleted_by: string | null
  delete_reason: string | null
  uploaded_by_name: string | null
}

interface CompetitionDraw {
  id: string
  competition_id: string
  drawn_at: string
  drawn_by: string | null
  method: string
  seed_sha256: string
  eligible_count: number
  winners: string[]
  reserves: string[]
  filters: Record<string, unknown>
  note: string | null
  drawn_by_name: string | null
}

interface CompetitionStats {
  total: number
  valid: number
  disqualified: number
  winners: number
  people: number
}

interface CompetitionPage {
  id: string
  is_published: boolean
  code: string
  code_name: string
}

export default defineEventHandler(async (event) => {
  const { row } = await requireCompetitionAccess(event, getRouterParam(event, 'id'))
  const [terms, documents, draws, stats, pages, client] = await Promise.all([
    queryRows<CompetitionTermVersion>(`SELECT id, version, sha256, created_by, created_at, terms_md FROM qr_competition_terms_versions WHERE competition_id = $1 ORDER BY version DESC`, [row.id]),
    queryRows<CompetitionDocument>(`SELECT d.*, u.name AS uploaded_by_name FROM qr_competition_documents d LEFT JOIN team_members u ON u.id = d.uploaded_by WHERE d.competition_id = $1 AND d.deleted_at IS NULL ORDER BY d.uploaded_at DESC`, [row.id]),
    queryRows<CompetitionDraw>(`SELECT d.*, u.name AS drawn_by_name FROM qr_competition_draws d LEFT JOIN team_members u ON u.id = d.drawn_by WHERE d.competition_id = $1 ORDER BY drawn_at DESC`, [row.id]),
    queryOne<CompetitionStats>(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'valid')::int AS valid, COUNT(*) FILTER (WHERE status = 'disqualified')::int AS disqualified, COUNT(*) FILTER (WHERE status = 'winner')::int AS winners, COUNT(DISTINCT entrant_hash)::int AS people FROM qr_competition_entries WHERE competition_id = $1`, [row.id]),
    queryRows<CompetitionPage>(`SELECT p.id, p.is_published, c.code, c.name AS code_name FROM qr_pages p JOIN qr_codes c ON c.id = p.qr_code_id WHERE p.competition_id = $1`, [row.id]),
    queryOne<{ name: string }>(`SELECT name FROM agency_clients WHERE id = $1`, [row.client_id])
  ])
  return { competition: { ...row, client_name: client?.name ?? null }, terms, documents, draws, stats, pages }
})
