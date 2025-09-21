type CacheRecord<T> = { value: T, expiresAt: number }

const CACHE_PREFIX = 'cache:'

function key(k: string) {
  return `${CACHE_PREFIX}${k}`
}

export async function getCached<T>(k: string): Promise<T | undefined> {
  const storage = useStorage()
  const rec = await storage.getItem<CacheRecord<T>>(key(k))
  if (!rec) return undefined
  if (rec.expiresAt <= Date.now()) {
    await storage.removeItem(key(k))
    return undefined
  }
  return rec.value
}

export async function setCached<T>(k: string, value: T, ttlMs: number): Promise<void> {
  const storage = useStorage()
  const rec: CacheRecord<T> = { value, expiresAt: Date.now() + ttlMs }
  await storage.setItem(key(k), rec)
}

export async function invalidatePrefix(prefix: string): Promise<void> {
  const storage = useStorage()
  const keys = await storage.getKeys(CACHE_PREFIX)
  const targets = keys.filter(k => k.startsWith(key(prefix)))
  await Promise.all(targets.map(k => storage.removeItem(k)))
}
