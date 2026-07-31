import { getQuery } from 'h3'
import {
  createGoogleOAuthAttempt
} from '~~/server/utils/googleCredentialProfiles'
import {
  SEARCH_CONSOLE_CALLBACK_PATH,
  buildGoogleOAuthRedirectUri,
  resolveGoogleOAuthRuntimeConfig
} from '~~/server/utils/googleOAuthRuntimeConfig'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { getSearchConsoleAuthUrl } from '~~/server/utils/searchAuthority/googleClient'

export default eventHandler(async (event) => {
  const clientId = String(getQuery(event).clientId || '')
  const user = await requireAgencySearchAuthorityAccess(event, clientId)
  const config = resolveGoogleOAuthRuntimeConfig(event)
  if (!config.googleClientId || !config.googleClientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Google OAuth credentials are not configured'
    })
  }

  const { attemptId, state } = await createGoogleOAuthAttempt(user.id, {
    purpose: 'search_console',
    context: { clientId }
  })
  const redirectUri = buildGoogleOAuthRedirectUri(
    event,
    config.searchConsoleRedirectUri,
    SEARCH_CONSOLE_CALLBACK_PATH
  )

  return {
    attemptId,
    url: getSearchConsoleAuthUrl(config.googleClientId, redirectUri, state)
  }
})
