import { AsyncLocalStorage } from 'node:async_hooks'
import type { PageStudioControlQueryClient } from '~~/shared/pageStudio/controlTypes'

type Runner = <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>
type Invocation = { active: boolean, run: Runner }
const invocations = new AsyncLocalStorage<Invocation>()
const unavailable = () => new Error('CMS database invocation is unavailable')

/** Each RPC owns its runner. An inherited async context is not a perpetual grant. */
export async function runCmsDatabaseInvocation<T>(run: Runner, work: () => Promise<T>): Promise<T> {
  const invocation: Invocation = { active: true, run }
  return invocations.run(invocation, async () => {
    try {
      return await work()
    } finally {
      invocation.active = false
    }
  })
}
export async function transactionWithoutRetry<T>(work: (db: PageStudioControlQueryClient) => Promise<T>): Promise<T> {
  const invocation = invocations.getStore()
  if (!invocation?.active) throw unavailable()
  return invocation.run(async (db) => {
    if (!invocation.active) throw unavailable()
    let active = true
    const guarded: PageStudioControlQueryClient = { query: async (sql, params) => {
      if (!invocation.active || !active) throw unavailable()
      const result = await db.query(sql, params)
      if (!invocation.active || !active) throw unavailable()
      return result as never
    } }
    try {
      return await work(guarded)
    } finally {
      active = false
    }
  })
}
// Existing authority helpers retain one transaction per call; never retry a write.
export const transaction = transactionWithoutRetry
export const transactionOnce = transactionWithoutRetry
export async function queryRows<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  return transactionWithoutRetry(async db => (await db.query<T>(sql, params)).rows)
}
export const query = queryRows
export const queryFresh = queryRows
export const queryRowsFresh = queryRows
export async function queryOneFresh<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
  return (await queryRows<T>(sql, params))[0] ?? null
}
export const queryOne = queryOneFresh
