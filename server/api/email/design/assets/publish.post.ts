import { defineEventHandler } from 'h3'
import { createDesignAssetStorage } from '~~/server/utils/email-marketing/designAssets'
import { designLibrarySession, designLibraryHttpError, readBoundedJson } from '~~/server/utils/email-marketing/designLibraryHttp'
import { publishDesignLibraryAsset } from '~~/server/utils/email-marketing/designLibraryOperations'
import { getAppUrl } from '~~/server/utils/appUrl'

export default defineEventHandler(async (event) => {
  try {
    const { authority } = await designLibrarySession(event, true)
    return await publishDesignLibraryAsset(await readBoundedJson(event, 4096), authority.actorId, authority.publisher, createDesignAssetStorage(event, getAppUrl(event)))
  } catch (error) { designLibraryHttpError(error) }
})
