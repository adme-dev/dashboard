/**
 * Blend presets
 * GET /api/agency/analytics/presets
 *
 * Lists the named data-blending presets (server/utils/blendPresets.ts) the
 * dashboard and report builder can apply in one click. Read-only, RBAC-gated.
 */
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { BLEND_PRESETS } from '~~/server/utils/blendPresets'

export default defineEventHandler(async (event) => {
  await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  return { presets: BLEND_PRESETS }
})
