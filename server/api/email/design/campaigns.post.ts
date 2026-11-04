import { defineEventHandler } from 'h3'
import { createCampaignFromTemplateRevision } from '~~/server/utils/email-marketing/designCampaigns'
import { designCampaignSession, designLibraryHttpError, readBoundedJson } from '~~/server/utils/email-marketing/designLibraryHttp'
import { createDesignAssetStorage } from '~~/server/utils/email-marketing/designAssets'
import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'
import { getAppUrl } from '~~/server/utils/appUrl'

export default defineEventHandler(async (event) => {
  try {
    const { env, authority } = await designCampaignSession(event, true)
    const storage = {
      read: (key: string) => createDesignAssetStorage(event, getAppUrl(event)).read(key),
      url: (id: string) => createDesignAssetStorage(event, getAppUrl(event)).url(id),
      identifyUrl: (url: string) => createDesignAssetStorage(event, getAppUrl(event)).identifyUrl(url)
    }
    return await createCampaignFromTemplateRevision(await readBoundedJson(event), authority, createEmailRenderer(env), storage)
  } catch (error) { designLibraryHttpError(error) }
})
