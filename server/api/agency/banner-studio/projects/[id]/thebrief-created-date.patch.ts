import { requireWriteAccess } from '~~/server/utils/auth'
import { requireBannerClientScope } from '~~/server/utils/banner/clientAccess'
import { isMarketingPortfolioUser } from '~~/server/utils/banner/marketingProjectAccess'
import { transaction } from '~~/server/utils/db'
import { theBriefCreatedDate } from '~~/app/utils/banner-library'

const dateTag = 'source-created-date:'
const pendingTag = 'import:created-date-pending'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  if (isMarketingPortfolioUser(user)) throw createError({ statusCode: 403, statusMessage: 'This role cannot change imported source metadata' })
  const id = getRouterParam(event, 'id')
  if (!id || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid banner project ID' })
  }
  const body = await readBody(event)
  const createdDate = typeof body?.createdDate === 'string' ? theBriefCreatedDate([dateTag + body.createdDate]) : null
  const expectedDate = body?.expectedDate === null ? null : typeof body?.expectedDate === 'string' ? theBriefCreatedDate([dateTag + body.expectedDate]) : undefined
  if (!createdDate || expectedDate === undefined || (expectedDate === null && body?.expectedDate !== null)) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid original creation date' })
  }
  setHeader(event, 'Cache-Control', 'private, no-store')
  return await transaction(async (db) => {
    const { rows } = await db.query('SELECT client_id, tags FROM banner_projects WHERE id = $1 FOR UPDATE', [id])
    const project = rows[0]
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Banner project not found' })
    await requireBannerClientScope(event, project.client_id || undefined)
    const tags: string[] = project.tags || []
    if (!tags.includes('source:thebrief')) throw createError({ statusCode: 409, statusMessage: 'This project has no The Brief source to date' })
    const previous = theBriefCreatedDate(tags)
    if (previous !== expectedDate && previous !== createdDate) {
      throw createError({ statusCode: 409, statusMessage: 'The original creation date changed. Refresh the library before trying again.' })
    }
    const next = [...tags.filter(tag => !tag.startsWith(dateTag) && tag !== pendingTag), dateTag + createdDate]
    if (previous !== createdDate || tags.includes(pendingTag)) {
      await db.query('UPDATE banner_projects SET tags = $1 WHERE id = $2', [next, id])
    }
    return { id, createdDate }
  })
})
