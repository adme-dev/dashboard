import pg from 'pg'

let client: pg.Client | null = null
let connecting: Promise<pg.Client> | null = null

function connectionString(): string {
  const value = (globalThis as { __HYPERDRIVE_CS?: string }).__HYPERDRIVE_CS
    || process.env.DATABASE_URL
  if (!value) throw new Error('CRM email Worker database is not configured')
  return value
}

async function getClient(): Promise<pg.Client> {
  if (client) return client
  if (connecting) return connecting
  connecting = (async () => {
    const next = new pg.Client({ connectionString: connectionString() })
    await next.connect()
    client = next
    connecting = null
    return next
  })()
  return connecting
}

export async function queryOne<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await (await getClient()).query<T>(sql, params)
  return result.rows[0] ?? null
}

export async function queryRows<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  return (await (await getClient()).query<T>(sql, params)).rows
}

export async function execute(sql: string, params?: unknown[]): Promise<number> {
  return (await (await getClient()).query(sql, params)).rowCount ?? 0
}

export async function transaction<T>(
  callback: (database: pg.Client) => Promise<T>
): Promise<T> {
  const database = await getClient()
  await database.query('BEGIN')
  try {
    const result = await callback(database)
    await database.query('COMMIT')
    return result
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}
