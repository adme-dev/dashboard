import { Client } from 'pg'
import type { LakebasePilotTarget } from './contracts'

export type PilotDatabaseQuery = (
  sql: string,
  params?: unknown[]
) => Promise<Record<string, unknown>[]>

export interface PilotDatabase {
  query: PilotDatabaseQuery
  transaction: <T>(callback: (query: PilotDatabaseQuery) => Promise<T>) => Promise<T>
  close: () => Promise<void>
}

export async function createPilotDatabase(target: LakebasePilotTarget): Promise<PilotDatabase> {
  const client = new Client({ connectionString: target.databaseUrl })
  await client.connect()

  const query: PilotDatabaseQuery = async (sql, params) => {
    const result = await client.query(sql, params)
    return result.rows as Record<string, unknown>[]
  }

  return {
    query,
    async transaction<T>(callback: (query: PilotDatabaseQuery) => Promise<T>): Promise<T> {
      await client.query('BEGIN')
      try {
        const result = await callback(query)
        await client.query('COMMIT')
        return result
      } catch (error) {
        try {
          await client.query('ROLLBACK')
        } catch {
          // Preserve the callback or commit failure that caused the rollback.
        }
        throw error
      }
    },
    async close(): Promise<void> {
      await client.end()
    }
  }
}
