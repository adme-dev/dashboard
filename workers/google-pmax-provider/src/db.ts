import pg from 'pg'

export async function queryRows(
  connectionString: string,
  sql: string,
  params: unknown[] = []
): Promise<unknown[]> {
  const client = new pg.Client({ connectionString })
  try {
    await client.connect()
    return (await client.query(sql, params)).rows
  } finally {
    await client.end().catch(() => {})
  }
}

export async function withTransaction<T>(
  connectionString: string,
  callback: (db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }) => Promise<T>
): Promise<T> {
  const transactionClient = new pg.Client({ connectionString })
  await transactionClient.connect()
  try {
    await transactionClient.query('BEGIN')
    const result = await callback({
      query: async (sql, params = []) => {
        const value = await transactionClient.query(sql, params)
        return { rows: value.rows as Array<Record<string, unknown>> }
      }
    })
    await transactionClient.query('COMMIT')
    return result
  } catch (error) {
    await transactionClient.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    await transactionClient.end().catch(() => {})
  }
}
