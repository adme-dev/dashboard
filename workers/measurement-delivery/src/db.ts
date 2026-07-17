import pg from 'pg'

interface QueryResult {
  rows?: unknown[]
}

interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<QueryResult>
}

export interface MeasurementWorkerDatabase {
  transaction<T>(callback: (db: TransactionClient) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export function createMeasurementWorkerDatabase(connectionString: string): MeasurementWorkerDatabase {
  const client = new pg.Client({ connectionString })
  let connected = false

  async function connect() {
    if (connected) return
    await client.connect()
    connected = true
  }

  return {
    async transaction<T>(callback: (db: TransactionClient) => Promise<T>): Promise<T> {
      await connect()
      await client.query('BEGIN')
      try {
        const result = await callback(client as unknown as TransactionClient)
        await client.query('COMMIT')
        return result
      } catch (error) {
        try {
          await client.query('ROLLBACK')
        } catch {
          // Preserve the original transaction failure.
        }
        throw error
      }
    },

    async close(): Promise<void> {
      if (!connected) return
      connected = false
      await client.end()
    }
  }
}
