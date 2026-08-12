import pg from 'pg'

let client: pg.Client | null = null
let connecting: Promise<pg.Client> | null = null

export async function queryRows(
  connectionString: string,
  sql: string,
  params: unknown[] = []
): Promise<unknown[]> {
  if (!client) {
    connecting ||= (async () => {
      const created = new pg.Client({ connectionString })
      await created.connect()
      client = created
      connecting = null
      return created
    })()
    await connecting
  }
  try {
    return (await client!.query(sql, params)).rows
  } catch (error) {
    if ((error as { code?: string }).code?.startsWith('08')) {
      await client?.end().catch(() => {})
      client = null
    }
    throw error
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
