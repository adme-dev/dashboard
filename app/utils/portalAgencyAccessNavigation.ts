export interface PortalDocumentLocation {
  assign(path: string): void
}

/**
 * Enter the client portal through a full document navigation so agency-only
 * requests and event streams cannot survive into the client session.
 */
export function navigateToPortalDocument(
  path: string,
  location: PortalDocumentLocation = window.location
): void {
  location.assign(path)
}
