/** Storyboard authoring is available by default; malformed overrides fail closed. */
export function isStoryboardFeatureEnabled(value: unknown): boolean {
  return value === undefined || value === 'true'
}
