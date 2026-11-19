import { createError } from 'h3'
import { z } from 'zod'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { gtmScope } from '~~/server/utils/ai/marketing/gtmAccess'
import { freshContextCoversClient } from '~~/server/utils/ai/marketing/reviewAuthority'
import { queryRowsFresh } from '~~/server/utils/db'

/** Also returned through MCP: external assistants do not need the native chat skill picker. */
export const MARKETING_TRACKING_ONBOARDING_GUIDE = `New client tracking setup
1. Resolve the exact client and call get_client_tracking_onboarding. Identify the public host, platform, form endpoint, existing conversion owner and consent policy. Inspect current source, tracking guides and available wiki/graph revisions; record stale or unavailable evidence.
2. If no tracking site exists, request its creation through /agency/tracking by an authorised operator. Google GTM OAuth currently requires an owner/admin in that screen. Never request tokens, credentials or customer payloads in chat. The owner can use list_gtm_connections, list_gtm_accounts and list_gtm_containers to obtain the non-secret identifiers without binding. Ask for the selected connection UUID and exact accounts/.../containers/... path only; do not guess or enumerate unassigned accounts.
3. Record current ownership with record_gtm_tracking_ownership. Native DriveAgent accepted enquiries retain native server conversion routing: do not propose the XeroFlow installer there. An external site requires a documented browser requirement and consent, with existing backend hooks and duplicate senders inspected.
4. For an unbound site, use propose_gtm_container_binding with initialMapping: true, siteId, ownershipEvidenceId, the operator-provided connectionId and exact containerPath. This creates a local request only, without Google reads or tag changes. A different owner/admin must review and execute the exact hash. This explicit path is required even if a sibling site uses the same identity; containers declaring unrelated domains are rejected. Use get_gtm_change_status; mapping verification proves only the local connection and provider host match.
5. Once mapped, inspect list_gtm_site_inventory and existing tags. Propose_gtm_xeroflow_installation prepares the installation request; it needs independent approval and execution to compile an isolated version. Do not use arbitrary custom HTML or bypass ownership/consent checks.
6. When installation is versioned, propose_gtm_publish for that exact sourceProposalId, then obtain separate independent approval and execution. Authorised reviewers use marketing_get_gtm_review, marketing_review_gtm_proposal and marketing_execute_gtm_proposal, or /agency/marketing/reviews/gtm. Requesters cannot approve themselves.
7. Read the recorded outcome and verify the exact live host, GTM tag and consent behaviour. Stored GTM read-back is not browser execution or customer conversion delivery. Report connection needed, awaiting approval, compiled, published and tag verified separately; actual event receipt/provider reporting remain unverified without evidence. Never fabricate an enquiry. Executing or unknown outcomes require inspection, never blind retry.`

interface SiteRow {
  id: string
  name: string
  allowed_origins: string[]
  binding_id: string | null
  connection_id: string | null
  container_path: string | null
  container_public_id: string | null
  last_verified_at: string | Date | null
  site_kind: string | null
  connection_status: string | null
  operation_held: boolean
}
interface ProposalRow { id: string, site_id: string, action_type: string, status: string, installation_publication: boolean, ownership_current: boolean, connection_active: boolean, connection_held: boolean }

function stage(site: SiteRow, proposal?: ProposalRow): string {
  if (site.operation_held || proposal?.connection_held || (proposal && ['executing', 'unknown'].includes(proposal.status))) return 'inspection_required'
  if (site.site_kind === 'native_driveagent') return 'native_server_route'
  if (!site.site_kind || (proposal && ['pending_review', 'approved'].includes(proposal.status) && !proposal.ownership_current)) return 'ownership_evidence_needed'
  if ((site.binding_id && site.connection_status !== 'active') || (proposal && ['pending_review', 'approved'].includes(proposal.status) && !proposal.connection_active)) return 'connection_reconnect_needed'
  if (proposal?.status === 'expired') return 'proposal_expired'
  if (proposal && ['pending_review', 'approved'].includes(proposal.status)) {
    const action = proposal.action_type === 'binding' ? 'mapping' : proposal.action_type
    return proposal.status === 'approved' ? `ready_to_execute_${action}` : `awaiting_${action}_approval`
  }
  if (!site.binding_id) return 'connection_needed'
  if (proposal?.status === 'versioned') return 'awaiting_publication'
  if (proposal?.installation_publication) return 'tag_verified_in_gtm'
  if (site.last_verified_at || (proposal?.status === 'verified' && proposal.action_type !== 'binding')) return 'live_verification_needed'
  return 'ready_to_install'
}

/** Stored, bounded and content-free. No provider reads, keys, snippets or implied delivery proof. */
export async function getClientTrackingOnboarding(ctx: ToolContext, rawClientId: string) {
  const clientId = z.string().uuid().parse(rawClientId)
  const fresh = await gtmScope(ctx)
  if (!await freshContextCoversClient(fresh, clientId))
    throw createError({ statusCode: 403, statusMessage: 'Tracking client access denied' })
  const sites = await queryRowsFresh<SiteRow>(
    `SELECT s.id,s.name,s.allowed_origins,b.id AS binding_id,b.connection_id,b.container_path,b.container_public_id,b.last_verified_at,
       e.evidence->>'siteKind' AS site_kind,c.status AS connection_status,
       (COALESCE(c.metadata ? 'reviewedExecution',FALSE) OR EXISTS (
         SELECT 1 FROM gtm_change_proposals held JOIN gtm_connections hc ON hc.id=held.connection_id
         WHERE held.site_id=s.id AND held.client_id=s.client_id AND hc.metadata->>'reviewedExecution'=held.id::text
       )) AS operation_held
     FROM tracking_sites s LEFT JOIN gtm_container_bindings b ON b.tracking_site_id=s.id
     LEFT JOIN gtm_connections c ON c.id=b.connection_id
     LEFT JOIN LATERAL (SELECT id,evidence,expires_at FROM gtm_tracking_ownership_evidence
       WHERE site_id=s.id AND client_id=s.client_id ORDER BY created_at DESC,id DESC LIMIT 1) latest_e ON TRUE
     LEFT JOIN LATERAL (SELECT latest_e.evidence WHERE latest_e.expires_at>NOW()
       AND s.allowed_origins @> ARRAY['https://' || (latest_e.evidence->>'publicHost')]) e ON TRUE
     WHERE s.client_id=$1 AND s.is_active=TRUE ORDER BY s.id LIMIT 101`, [clientId]
  )
  const proposals = await queryRowsFresh<ProposalRow>(
    `SELECT DISTINCT ON (p.site_id) p.id,p.site_id,p.action_type,
       (pc.status='active') AS connection_active,(pc.metadata ? 'reviewedExecution') AS connection_held,
       CASE WHEN p.status IN ('pending_review','approved') AND p.expires_at<=NOW() THEN 'expired' ELSE p.status END AS status,
       COALESCE(e.expires_at>NOW() AND s.allowed_origins @> ARRAY['https://' || (e.evidence->>'publicHost')]
         AND e.id=(SELECT id FROM gtm_tracking_ownership_evidence WHERE site_id=p.site_id AND client_id=p.client_id ORDER BY created_at DESC,id DESC LIMIT 1),FALSE) AS ownership_current,
       COALESCE(p.action_type='publish' AND p.status='verified' AND source.action_type='installation'
         AND source.site_id=p.site_id AND source.client_id=p.client_id
         AND p.binding_id=b.id AND source.binding_id=b.id AND p.connection_id=b.connection_id AND source.connection_id=b.connection_id
         AND p.desired_state->>'containerPath'=b.container_path AND source.desired_state->>'containerPath'=b.container_path
         AND p.change_set_id=latest_change.id,FALSE) AS installation_publication
     FROM gtm_change_proposals p JOIN tracking_sites s ON s.id=p.site_id
     JOIN gtm_tracking_ownership_evidence e ON e.id=p.ownership_evidence_id
     JOIN gtm_connections pc ON pc.id=p.connection_id
     LEFT JOIN gtm_container_bindings b ON b.tracking_site_id=p.site_id
     LEFT JOIN gtm_change_proposals source ON source.id::text=p.desired_state->'input'->>'sourceProposalId'
     LEFT JOIN LATERAL (SELECT id FROM gtm_change_sets WHERE binding_id=b.id ORDER BY updated_at DESC,created_at DESC,id DESC LIMIT 1) latest_change ON TRUE
     WHERE p.client_id=$1 AND p.site_id=ANY($2::uuid[])
     ORDER BY p.site_id,GREATEST(p.created_at,p.executed_at) DESC,p.id DESC`,
    [clientId, sites.slice(0, 100).map(site => site.id)]
  )
  return {
    clientId, stage: sites.length ? 'site_assessment' : 'site_setup_needed',
    guide: MARKETING_TRACKING_ONBOARDING_GUIDE,
    setupHref: '/agency/tracking', reviewHref: '/agency/marketing/reviews/gtm',
    evidence: 'stored_configuration_and_proposal_status_only', conversionDelivery: 'not_verified',
    truncated: sites.length > 100,
    sites: sites.slice(0, 100).map((site) => {
      const proposal = proposals.find(row => row.site_id === site.id)
      return {
        siteId: site.id, name: site.name, allowedOrigins: site.allowed_origins,
        stage: stage(site, proposal),
        binding: site.binding_id ? { id: site.binding_id, connectionId: site.connection_id, containerPath: site.container_path, publicId: site.container_public_id } : null,
        lastVerifiedAt: site.last_verified_at, latestProposal: proposal ?? null
      }
    })
  }
}
