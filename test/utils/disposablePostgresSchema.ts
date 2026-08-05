export interface DisposablePostgresClient {
  connect: () => Promise<unknown>
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
  end: () => Promise<unknown>
}

export async function withDisposablePostgresSchema(input: {
  client: DisposablePostgresClient
  schema: string
  bootstrapSql: string
  migrationSql: string
  run: (client: DisposablePostgresClient) => Promise<void>
}): Promise<void> {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(input.schema)) {
    throw new Error('Invalid disposable schema name')
  }
  const quotedSchema = `"${input.schema}"`
  let connected = false
  let connectAttempted = false
  let schemaCreated = false
  let transactionOpen = false
  let primaryError: unknown
  let cleanupError: unknown

  try {
    connectAttempted = true
    await input.client.connect()
    connected = true
    await input.client.query(`CREATE SCHEMA ${quotedSchema}`)
    schemaCreated = true
    transactionOpen = true
    await input.client.query('BEGIN')
    await input.client.query(`SET LOCAL search_path TO ${quotedSchema}, pg_catalog`)
    const selected = await input.client.query('SELECT current_schema() AS schema')
    if (selected.rows[0]?.schema !== input.schema) {
      throw new Error('Disposable schema was not selected')
    }
    await input.client.query(input.bootstrapSql)
    await input.client.query(input.migrationSql)
    await input.client.query(input.migrationSql)
    await input.run(input.client)
  } catch (error) {
    primaryError = error
  } finally {
    if (connected && transactionOpen) {
      try {
        await input.client.query('ROLLBACK')
      } catch (error) {
        cleanupError ??= error
      }
    }
    if (connected && schemaCreated) {
      try {
        await input.client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`)
      } catch (error) {
        cleanupError ??= error
      }
    }
    if (connectAttempted) {
      try { await input.client.end() } catch (error) { cleanupError ??= error }
    }
  }

  if (primaryError) throw primaryError
  if (cleanupError) throw cleanupError
}
