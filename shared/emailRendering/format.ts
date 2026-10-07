/** Lightweight format check; never imports the renderer or block registry. */
export function isFlyhubFormat(json: unknown): boolean {
  if (!json || typeof json !== 'object' || !Object.hasOwn(json, 'root')) return false
  const root = (json as { root?: unknown }).root
  return !!root && typeof root === 'object' && (root as { type?: unknown }).type === 'EmailLayout'
}
