import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireStoryboardEnabled } from '~~/server/utils/video-storyboard/policy'
import { storyboardRouteId, storyboardRequestDependencies } from '~~/server/utils/video-storyboard/request'
import { resolveStoryboard } from '~~/server/utils/video-storyboard/resolve'
import { compileStoryboard } from '~~/shared/video/storyboardCompile'
import { StoryboardTargetFormatSchema } from '~~/shared/video/storyboardRecipes'

const Request = z.object({ revisionId: z.string().uuid(), formats: z.array(StoryboardTargetFormatSchema).min(1).max(3) }).strict()
export default defineEventHandler(async (event) => {
  const actor = await requireWriteAccess(event)
  requireStoryboardEnabled(event)
  const projectId = storyboardRouteId(event)
  const parsed = Request.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid storyboard resolution request' })
  const resolved = await resolveStoryboard({ actor, projectId, ...parsed.data }, storyboardRequestDependencies(event))
  const compiled = compileStoryboard(resolved)
  // No client-returned authority: T06 regenerates and persists obligations itself.
  return compiled.ok ? { ok: true, findings: compiled.findings, timeline: compiled.timeline } : compiled
})
