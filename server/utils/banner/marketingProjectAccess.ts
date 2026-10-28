// Browser Banner Studio write boundary for the dedicated marketing-management portfolio role.
// That role reaches every ACTIVE client (never the legacy unrestricted all-client path), so its
// create/PATCH/duplicate/delete writes re-check fresh permission and the active client, bind the
// write to the checked state, and keep the same protected-artwork rules as the department MCP: in-review or
// approved artwork and imported TheBrief canvases are never overwritten, provenance tags are
// preserved exactly and never supplied, and copies are new work without import provenance.
// Other roles keep the legacy route semantics unchanged.
import { createError, type H3Event } from 'h3'
import type { User } from '~~/server/utils/auth'
import { hasFreshMarketingManagementPermission } from '~~/server/utils/clientScoping'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

export interface MarketingBannerProject {
  client_id: string | null
  created_by: string | null
  tags: string[] | null
  review_status?: string | null
}

export const isBannerProvenanceTag = (tag: unknown) => typeof tag === 'string' && /^source(:|-sha256)/i.test(tag)

export function isMarketingPortfolioUser(user: Pick<User, 'role' | 'permissionGroups'>): boolean {
  return user.permissionGroups?.includes('MARKETING_MANAGEMENT') === true && !hasAllSocialClientAccess(user)
}

/** Fresh MARKETING_MANAGEMENT plus an active client, or the caller's own unassigned project. */
export async function requireMarketingBannerProjectAccess(event: H3Event, user: Pick<User, 'id'>, project: MarketingBannerProject): Promise<void> {
  if (project.client_id) {
    await requireSocialClientAccess(event, project.client_id)
    return
  }
  if (project.created_by !== user.id || !await hasFreshMarketingManagementPermission(user.id)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
  }
}

/** Validates a marketing PATCH against protected artwork; returns the tags to store, if any. */
export async function checkMarketingBannerProjectPatch(
  event: H3Event,
  user: Pick<User, 'id'>,
  project: MarketingBannerProject,
  body: { name?: unknown, canvasData?: unknown, tags?: unknown, clientId?: unknown }
): Promise<{ tags?: string[] }> {
  await requireMarketingBannerProjectAccess(event, user, project)
  const conflict = (statusMessage: string): never => {
    throw createError({ statusCode: 409, statusMessage })
  }
  const imported = (project.tags ?? []).some(isBannerProvenanceTag)
  const moving = body.clientId !== undefined && body.clientId !== project.client_id
  if (['in_review', 'approved'].includes(project.review_status ?? '')
    && (body.canvasData !== undefined || body.name !== undefined || body.tags !== undefined || moving)) {
    conflict('Artwork under review or approved is protected; duplicate the project to make changes')
  }
  if (imported && (body.canvasData !== undefined || moving)) {
    conflict('Imported source artwork is protected; duplicate the project to edit it')
  }
  if (moving) {
    if (body.clientId === null) {
      if (project.created_by !== user.id) throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
    } else {
      await requireSocialClientAccess(event, String(body.clientId))
    }
  }
  if (body.tags === undefined) return {}
  if (!Array.isArray(body.tags) || body.tags.some(tag => typeof tag !== 'string' || isBannerProvenanceTag(tag))) {
    throw createError({ statusCode: 400, statusMessage: 'Tags must be plain labels; source provenance cannot be supplied' })
  }
  return { tags: [...new Set([...(project.tags ?? []).filter(isBannerProvenanceTag), ...body.tags as string[]])] }
}

/** Protected artwork (in review, approved or an imported TheBrief source) is never deleted. */
export function assertMarketingBannerProjectDeletable(project: MarketingBannerProject): void {
  if (['in_review', 'approved'].includes(project.review_status ?? '') || (project.tags ?? []).some(isBannerProvenanceTag)) {
    throw createError({ statusCode: 409, statusMessage: 'Reviewed, approved or imported artwork is protected and cannot be deleted' })
  }
}

/** Marketing create: plain-label tags, and an active client (or an unassigned project of their own). */
export async function requireMarketingBannerProjectCreate(event: H3Event, user: Pick<User, 'id'>, input: { clientId?: unknown, tags?: unknown }): Promise<void> {
  if (Array.isArray(input.tags) && input.tags.some(isBannerProvenanceTag)) {
    throw createError({ statusCode: 400, statusMessage: 'Source provenance tags are reserved for TheBrief imports' })
  }
  if (input.clientId) {
    await requireSocialClientAccess(event, String(input.clientId))
  } else if (!await hasFreshMarketingManagementPermission(user.id)) {
    throw createError({ statusCode: 403, statusMessage: 'Marketing permission revoked' })
  }
}

/** Active-client predicate for a write statement's target row (`banner_projects` alias required). */
export const ACTIVE_PROJECT_CLIENT_SQL = `(banner_projects.client_id IS NULL OR EXISTS (SELECT 1 FROM agency_clients active_client
  WHERE active_client.id = banner_projects.client_id AND active_client.is_active = TRUE))`
