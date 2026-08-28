import { requireRole } from '~~/server/utils/auth'
import { buildGoogleOAuthRedirectUri } from '~~/server/utils/googleOAuthRuntimeConfig'
import { GTM_CALLBACK_PATH, resolveGtmOAuthRuntimeConfig } from '~~/server/utils/googleTagManagerOAuthRuntimeConfig'
import { createGtmOAuthAttempt, getGtmAuthUrl } from '~~/server/utils/googleTagManagerStore'

export default eventHandler(async (event) => {
  const user = await requireRole(event, ['owner', 'admin'])
  const config = resolveGtmOAuthRuntimeConfig(event)
  if (!config.googleClientId || !config.googleClientSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Google Tag Manager OAuth credentials are not configured' })
  }
  const state = await createGtmOAuthAttempt(user.id)
  const redirectUri = buildGoogleOAuthRedirectUri(event, config.googleRedirectUri, GTM_CALLBACK_PATH)
  return {
    url: getGtmAuthUrl({ clientId: config.googleClientId, redirectUri, state }),
  }
})
