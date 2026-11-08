/** Public discovery defaults on; this does not authorize server/provider operations.
 * Explicit false and malformed overrides hide the surface for rollback.
 */
export function isPublicVideoFeatureEnabled(value: unknown): boolean {
  return value === undefined || value === 'true'
}
