/**
 * Single LinkedIn Marketing/Community Management REST version for every
 * `api.linkedin.com/rest/*` call (organic OAuth discovery, Page publishing,
 * inbox/analytics, and Ads reporting).
 *
 * LinkedIn rejects sunset version headers outright, and versions live for
 * ~12 months, so bump this at least yearly:
 * https://learn.microsoft.com/en-us/linkedin/marketing/versioning
 */
export const LINKEDIN_API_VERSION = '202610'
