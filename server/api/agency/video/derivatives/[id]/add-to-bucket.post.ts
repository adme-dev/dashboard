import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { DEFAULT_VIDEO_BUCKETS, type VideoBucketKind } from '~~/server/utils/video-asset-intelligence/buckets'
import { addDerivativeToProjectBucket, getAssetDerivative } from '~~/server/utils/video-asset-intelligence/db'
import { withGodModeLedger } from '~~/server/utils/video/godModeStudioMutations'

const VIDEO_BUCKET_KINDS = DEFAULT_VIDEO_BUCKETS.map(bucket => bucket.kind) as [VideoBucketKind, ...VideoBucketKind[]]

const BodySchema = z.object({
  bucketKind: z.enum(VIDEO_BUCKET_KINDS).default('generated'),
  role: z.string().trim().min(1).max(120).nullable().optional(),
  title: z.string().trim().min(1).max(240).nullable().optional(),
  directive: z.record(z.string(), z.unknown()).default({}),
})

// Owners (God mode) run this under the execution ledger; staff run it directly.
export default defineEventHandler(event => withGodModeLedger(event, 'derivativeAddToBucket', async () => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Derivative id is required' })
  const body = BodySchema.parse(await readBody(event))
  const derivative = await getAssetDerivative(id)
  if (!derivative) throw createError({ statusCode: 404, statusMessage: 'Derivative not found' })
  if (!derivative.projectId) throw createError({ statusCode: 400, statusMessage: 'Derivative is not attached to a project' })

  const existing = await getProjectWithCurrentTimeline(derivative.projectId)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (existing.project.mediaType !== 'av') throw createError({ statusCode: 400, statusMessage: 'Derivative bucket reuse requires an AV project' })
  if (user.role !== 'admin' && user.role !== 'owner' && existing.project.createdBy !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Access denied to this project' })
  }

  const item = await addDerivativeToProjectBucket({
    derivative,
    bucketKind: body.bucketKind,
    role: body.role,
    title: body.title,
    directive: body.directive,
  })
  setResponseStatus(event, 201)
  return { item, derivative }
}))
