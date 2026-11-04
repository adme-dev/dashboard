export function sameDesignSource(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameDesignSource((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}
