import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  classifyLakebaseReadiness,
  inspectLakebaseCapability,
  type LakebaseReadinessBlocker
} from './capability'
import { LakebasePilotSafetyError, redactPilotTarget, resolvePilotTarget } from './contracts'
import {
  closePilotDatabasePreservingError,
  createPilotDatabase,
  type PilotDatabase
} from './database'

export type PilotEntityType = 'person' | 'company' | 'opportunity' | 'activity' | 'task'

export interface LakebasePilotFixtureDocument {
  clientId: string
  type: PilotEntityType
  id: string
  title: string
  subtitle: string | null
  body: string
  deleted: boolean
}

export interface LakebasePilotFixture {
  clients: Array<{ id: string, name: string }>
  documents: LakebasePilotFixtureDocument[]
  queries: Array<{
    id: string
    clientId: string
    query: string
    relevantIds: string[]
  }>
}

export interface LakebasePilotFixtureRow extends Omit<LakebasePilotFixtureDocument, 'deleted'> {
  contentHash: string
}

export interface PilotSetupDependencies {
  env: Record<string, string | undefined>
  createDatabase?: (target: ReturnType<typeof resolvePilotTarget>) => Promise<PilotDatabase>
}

export type LakebasePilotSetupCliOutput
  = | { status: 'completed', result: Awaited<ReturnType<typeof runPilotSetup>> }
    | { status: 'blocked', code: string }

export interface RunPilotSetupCliDependencies {
  runSetup?: typeof runPilotSetup
  write?: (output: LakebasePilotSetupCliOutput) => void
}

export interface RunPilotSetupCliResult {
  exitCode: 0 | 1
  output: LakebasePilotSetupCliOutput
}

export class LakebasePilotSetupError extends Error {
  constructor(
    readonly code: 'lakebase_capability_not_ready',
    readonly blockers: LakebaseReadinessBlocker[]
  ) {
    super(code)
    this.name = 'LakebasePilotSetupError'
  }
}

const INDEX_NAMES = [
  'crm_search_documents_client_idx',
  'crm_search_documents_gin_idx',
  'crm_search_documents_bm25_idx'
]

function contentHash(document: LakebasePilotFixtureDocument): string {
  return createHash('sha256')
    .update(JSON.stringify({
      clientId: document.clientId,
      type: document.type,
      id: document.id,
      title: document.title,
      subtitle: document.subtitle,
      body: document.body
    }))
    .digest('hex')
}

export function loadFixtureRows(fixture: LakebasePilotFixture): LakebasePilotFixtureRow[] {
  return fixture.documents
    .filter(document => !document.deleted)
    .map(document => ({
      clientId: document.clientId,
      type: document.type,
      id: document.id,
      title: document.title,
      subtitle: document.subtitle,
      body: document.body,
      contentHash: contentHash(document)
    }))
}

async function readFixture(): Promise<LakebasePilotFixture> {
  const json = await readFile(new URL('../../test/fixtures/lakebase-crm-search.json', import.meta.url), 'utf8')
  return JSON.parse(json) as LakebasePilotFixture
}

async function readSql(name: 'schema.sql' | 'indexes.sql'): Promise<string> {
  return readFile(new URL(`./sql/${name}`, import.meta.url), 'utf8')
}

export async function runPilotSetup(deps: PilotSetupDependencies) {
  const target = resolvePilotTarget(deps.env, 'mutate')
  const database = await (deps.createDatabase || createPilotDatabase)(target)
  let operationCompleted = false
  let primaryError: unknown

  try {
    const capability = await inspectLakebaseCapability(database.query)
    const readiness = classifyLakebaseReadiness(capability)
    if (!readiness.ready) {
      throw new LakebasePilotSetupError('lakebase_capability_not_ready', readiness.blockers)
    }

    const [schemaSql, indexesSql, fixture] = await Promise.all([
      readSql('schema.sql'),
      readSql('indexes.sql'),
      readFixture()
    ])
    const rows = loadFixtureRows(fixture)

    await database.transaction(async (query) => {
      await query(schemaSql)
      await query('TRUNCATE lakebase_pilot.crm_search_documents')
      for (const row of rows) {
        await query(`
INSERT INTO lakebase_pilot.crm_search_documents
  (client_id, entity_type, entity_id, title, subtitle, body, content_hash)
VALUES ($1, $2, $3, $4, $5, $6, $7)
`, [row.clientId, row.type, row.id, row.title, row.subtitle, row.body, row.contentHash])
      }
      await query(indexesSql)
    })

    await database.query('VACUUM ANALYZE lakebase_pilot.crm_search_documents')

    const result = {
      target: redactPilotTarget(target),
      fixtureCount: fixture.documents.length,
      insertedCount: rows.length,
      skippedDeletedCount: fixture.documents.length - rows.length,
      indexes: [...INDEX_NAMES]
    }
    operationCompleted = true
    return result
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    await closePilotDatabasePreservingError(database, { operationCompleted, primaryError })
  }
}

function setupFailureCode(error: unknown): string {
  if (error instanceof LakebasePilotSafetyError || error instanceof LakebasePilotSetupError) return error.code
  return 'pilot_setup_failed'
}

export async function runPilotSetupCli(
  args: { env?: Record<string, string | undefined> } = {},
  deps: RunPilotSetupCliDependencies = {}
): Promise<RunPilotSetupCliResult> {
  const write = deps.write || (output => console.log(JSON.stringify(output)))
  try {
    const result = await (deps.runSetup || runPilotSetup)({ env: args.env || process.env })
    const output: LakebasePilotSetupCliOutput = { status: 'completed', result }
    write(output)
    return { exitCode: 0, output }
  } catch (error) {
    const output: LakebasePilotSetupCliOutput = { status: 'blocked', code: setupFailureCode(error) }
    write(output)
    return { exitCode: 1, output }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPilotSetupCli().then((result) => {
    process.exitCode = result.exitCode
  })
}
