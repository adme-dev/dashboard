import { readMultipartFormData } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { uploadBannerAsset } from '~~/server/utils/bannerStorage'

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

const KNOWN_FORMATS: Record<string, { w: number; h: number; name: string }> = {
  mrec: { w: 300, h: 250, name: 'MRec' },
  leader: { w: 728, h: 90, name: 'Leaderboard' },
  half: { w: 300, h: 600, name: 'Half Page' },
  wsky: { w: 160, h: 600, name: 'Wide Skyscraper' },
  billboard: { w: 970, h: 250, name: 'Billboard' },
  mob_ban: { w: 320, h: 50, name: 'Mobile Banner' },
  mob_lg: { w: 320, h: 100, name: 'Large Mobile' },
  fb_feed: { w: 1200, h: 628, name: 'FB Feed' },
  fb_sq: { w: 1080, h: 1080, name: 'FB Square' },
  fb_story: { w: 1080, h: 1920, name: 'FB Story' },
  fb_cover: { w: 820, h: 312, name: 'FB Cover' },
  ig_sq: { w: 1080, h: 1080, name: 'IG Square' },
  ig_port: { w: 1080, h: 1350, name: 'IG Portrait' },
  ig_story: { w: 1080, h: 1920, name: 'IG Story' },
  ig_land: { w: 1080, h: 566, name: 'IG Landscape' },
  tt_feed: { w: 1080, h: 1920, name: 'TT Feed' },
  tt_sq: { w: 1080, h: 1080, name: 'TT Square' },
  tt_land: { w: 1280, h: 720, name: 'TT Landscape' },
  li_feed: { w: 1200, h: 627, name: 'LI Feed' },
  li_sq: { w: 1200, h: 1200, name: 'LI Square' },
  li_story: { w: 1080, h: 1920, name: 'LI Story' },
  li_carousel: { w: 1080, h: 1080, name: 'LI Carousel' },
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No files uploaded' })
  }

  // Extract project name
  const nameField = formData.find(f => f.name === 'name')
  const projectName = nameField?.data?.toString()?.trim()
  if (!projectName) {
    throw createError({ statusCode: 400, statusMessage: 'Project name is required' })
  }

  // Extract dimensions JSON (client-provided from browser Image API)
  const dimField = formData.find(f => f.name === 'dimensions')
  let dimensions: { w: number; h: number }[] = []
  if (dimField?.data) {
    try {
      dimensions = JSON.parse(dimField.data.toString())
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid dimensions data' })
    }
  }

  // Extract client ID (optional)
  const clientIdField = formData.find(f => f.name === 'clientId')
  const clientId = clientIdField?.data?.toString()?.trim() || null

  // Collect image files
  const files = formData.filter(f => f.name === 'files' && f.data && f.filename)
  if (files.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No image files provided' })
  }

  if (dimensions.length !== files.length) {
    throw createError({ statusCode: 400, statusMessage: 'Dimensions count must match file count' })
  }

  // Validate mime types
  for (const file of files) {
    const mimeType = file.type || 'application/octet-stream'
    if (!ALLOWED_TYPES.has(mimeType)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid file type: ${mimeType}. Allowed: PNG, JPG, GIF, WebP`,
      })
    }
  }

  try {
    // Upload each file and build canvas_data
    const canvasData: Record<string, any> = {}
    const usedKeys = new Set<string>()

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const dim = dimensions[i]
      if (!file || !dim) {
        throw createError({ statusCode: 400, statusMessage: 'Dimensions count must match file count' })
      }
      const fileName = file.filename || `image-${i}`
      const mimeType = file.type || 'image/png'
      // Upload to R2
      const { url } = await uploadBannerAsset(file.data as Buffer, fileName, mimeType, user.id)

      // Determine format key — use dimensions to find a standard format
      let formatKey = `custom_${dim.w}x${dim.h}`
      let formatName = `Custom (${dim.w}x${dim.h})`

      for (const [key, fmt] of Object.entries(KNOWN_FORMATS)) {
        if (fmt.w === dim.w && fmt.h === dim.h) {
          formatKey = key
          formatName = fmt.name
          break
        }
      }

      // Deduplicate format keys (e.g. two 1080x1080 images)
      let finalKey = formatKey
      if (usedKeys.has(finalKey)) {
        let suffix = 2
        while (usedKeys.has(`${formatKey}_${suffix}`)) suffix++
        finalKey = `${formatKey}_${suffix}`
      }
      usedKeys.add(finalKey)

      canvasData[finalKey] = {
        bgColor: '#000000',
        layers: [{
          id: 1,
          type: 'bg',
          name: formatName,
          x: 0,
          y: 0,
          w: dim.w,
          h: dim.h,
          zIndex: 0,
          src: url,
          srcType: 'image',
          hidden: false,
          locked: false,
          opacity: 1,
          animIn: 'none',
          delay: 0,
          dur: 0,
        }],
      }
    }

    // Create banner project
    const row = await queryOne(`
      INSERT INTO banner_projects (name, client_id, canvas_data, tags, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id, name,
        client_id AS "clientId",
        canvas_data AS "canvasData",
        thumbnail_url AS "thumbnailUrl",
        status, tags,
        created_by AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `, [
      projectName,
      clientId,
      JSON.stringify(canvasData),
      ['uploaded'],
      user.id,
    ])

    return {
      id: row.id,
      name: row.name,
      formatCount: Object.keys(canvasData).length,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create upload project:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create upload project' })
  }
})
