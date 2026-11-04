import { defineEventHandler } from 'h3'
import { executeDesignModules } from '~~/server/utils/email-marketing/designModules'
import { createDesignAssetStorage } from '~~/server/utils/email-marketing/designAssets'
import { designLibrarySession, designLibraryHttpError, readBoundedJson } from '~~/server/utils/email-marketing/designLibraryHttp'
import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'
import { getAppUrl } from '~~/server/utils/appUrl'

export default defineEventHandler(async (event) => {
  try {
    const { env, authority } = await designLibrarySession(event, true)
    const request = await readBoundedJson(event)
    // Text-only modules need no media transport. Resolve storage lazily only
    // if a verified asset operation actually requests it.
    const storage = {
      read: (key: string) => createDesignAssetStorage(event, getAppUrl(event)).read(key),
      url: (id: string) => createDesignAssetStorage(event, getAppUrl(event)).url(id),
      identifyUrl: (url: string) => createDesignAssetStorage(event, getAppUrl(event)).identifyUrl(url)
    }
    return await executeDesignModules(request, authority, createEmailRenderer(env), storage)
  } catch (error) { designLibraryHttpError(error) }
})
