import type { FeedProvider } from './types'
import type { SocialDashboardClient } from './socialDashboardClient'
import { createSocialDashboardProvider } from './providers/socialDashboard'
import { SOCIAL_DASHBOARD_PROVIDER_ID } from './constants'

/** Resolve a provider by id. The social-dashboard provider needs a client injected by the caller. */
export function getFeedProvider(id: string, deps: { socialDashboardClient?: SocialDashboardClient } = {}): FeedProvider {
  if (id === SOCIAL_DASHBOARD_PROVIDER_ID) {
    if (!deps.socialDashboardClient) throw new Error('social-dashboard provider requires a client')
    return createSocialDashboardProvider(deps.socialDashboardClient)
  }
  throw new Error(`unknown feed provider: ${id}`)
}
