import { defineEventHandler } from 'h3'
import { executeDesignHistory } from '~~/server/utils/email-marketing/designHistory'
import { createDesignAssetStorage } from '~~/server/utils/email-marketing/designAssets'
import {
  designLibrarySession,
  designLibraryHttpError,
  readBoundedJson
} from '~~/server/utils/email-marketing/designLibraryHttp'
import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'
import { getAppUrl } from '~~/server/utils/appUrl'

export default defineEventHandler(async (event) => {
  try {
    const { env, authority } = await designLibrarySession(event, true)
    const storage = {
      read: (key: string) => createDesignAssetStorage(event, getAppUrl(event)).read(key),
      url: (id: string) => createDesignAssetStorage(event, getAppUrl(event)).url(id),
      identifyUrl: (url: string) => createDesignAssetStorage(event, getAppUrl(event)).identifyUrl(url)
    }
    return await executeDesignHistory(await readBoundedJson(event), authority, createEmailRenderer(env), storage)
  } catch (error) {
    designLibraryHttpError(error)
  }
})
