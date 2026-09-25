export class PageStudioPublishingError extends Error {
  constructor(
    readonly code:
      | 'BUILD_NOT_PUBLISHABLE'
      | 'CONTROL_SCOPE_NOT_FOUND'
      | 'PUBLISH_AUTHORITY_DENIED'
      | 'PUBLISH_AUTHORITY_BUSY'
      | 'RELEASE_IDEMPOTENCY_CONFLICT'
      | 'RELEASE_POINTER_CONFLICT'
      | 'RELEASE_RECORD_INVALID'
      | 'RELEASE_WORKER_UNAVAILABLE'
      | 'ROLLBACK_TARGET_INVALID'
      | 'SITE_NOT_PUBLISHABLE',
    readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'PageStudioPublishingError'
  }
}
