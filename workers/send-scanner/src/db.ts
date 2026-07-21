import pg from 'pg'

interface QueryClientLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>
}

export function createHyperdriveDatabase(connectionString: string) {
  async function withClient<T>(callback: (client: pg.Client) => Promise<T>): Promise<T> {
    const client = new pg.Client({ connectionString })
    try {
      await client.connect()
      return await callback(client)
    } finally {
      await client.end().catch(() => undefined)
    }
  }

  return {
    async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      return withClient(async (client) => {
        const result = await client.query(sql, params)
        return (result.rows[0] as T | undefined) ?? null
      })
    },

    async transaction<T>(callback: (database: QueryClientLike) => Promise<T>): Promise<T> {
      return withClient(async (client) => {
        await client.query('BEGIN')
        try {
          const result = await callback(client as unknown as QueryClientLike)
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined)
          throw error
        }
      })
    }
  }
}
