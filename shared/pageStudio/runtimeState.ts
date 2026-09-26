/** Draft, approved and live runtime versions shown in the publishing UI. */
export interface PageStudioRuntimeState {
  approved: { checkpointId: string, digest: string, versionId: string, live: boolean } | null
  deliveryMode: 'static' | 'runtime'
  /** Release environment this Dashboard publishes to, and the site's existing hostname there. */
  environment: 'staging' | 'production'
  hostname: string | null
  draft: { checkpointId: string, digest: string, savedAt: string, previewHostname: string | null } | null
  releases: Array<{
    active: boolean
    hostname: string
    publishedAt: string
    releaseId: string
    renderer: string
    versionDigest: string
    versionId: string
  }>
  rendererConfigured: boolean
}
