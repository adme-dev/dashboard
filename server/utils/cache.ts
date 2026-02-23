/**
 * Simple in-memory cache for server-side data
 * Used to reduce database round-trips for frequently accessed, rarely changed data
 */

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>()
  private defaultTTL: number

  constructor(defaultTTLMs: number = 60000) {
    this.defaultTTL = defaultTTLMs
    
    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return undefined
    }
    
    return entry.data as T
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTL)
    })
  }

  delete(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  // Get all keys (for prefix matching)
  keys(): string[] {
    return Array.from(this.cache.keys())
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }
}

// Session cache - 30 seconds (balances security with performance)
export const sessionCache = new MemoryCache(30000)

// Workspaces cache - 5 minutes (workspaces rarely change)
export const workspaceCache = new MemoryCache(5 * 60 * 1000)

// Departments cache - 2 minutes
export const departmentCache = new MemoryCache(2 * 60 * 1000)

// Generic cache for any data
export const cache = new MemoryCache(60000)

// Legacy API for compatibility with existing code
export function getCached<T>(key: string): T | undefined {
  return cache.get<T>(key)
}

export function setCached<T>(key: string, data: T, ttlMs?: number): void {
  cache.set(key, data, ttlMs)
}

// Invalidate all cache entries with a given prefix
export async function invalidatePrefix(prefix: string): Promise<void> {
  // Remove from generic cache
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
    }
  }
  
  // Also check other caches
  for (const key of sessionCache.keys()) {
    if (key.startsWith(prefix)) {
      sessionCache.delete(key)
    }
  }
  
  for (const key of workspaceCache.keys()) {
    if (key.startsWith(prefix)) {
      workspaceCache.delete(key)
    }
  }
  
  for (const key of departmentCache.keys()) {
    if (key.startsWith(prefix)) {
      departmentCache.delete(key)
    }
  }
}
