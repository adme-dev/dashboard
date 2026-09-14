export class PageStudioEmailConfigurationError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message)
    this.name = 'PageStudioEmailConfigurationError'
  }
}
export type PageStudioEmailActor = { actorId: string } & (
  | { role: 'agency', tenantId: string, canEdit: boolean }
  | { role: 'client', clientId: string }
)
