import { z } from 'zod'
import {
  DESIGN_LIMITS,
  EmailDesignError,
  validateEmailDesign,
  type EmailDesignDocument
} from '../../../shared/emailRendering/designContract'

export interface ResolvedModuleRevision {
  moduleId: string
  revisionId: string
  design: unknown
}
export interface ValidatedModuleRevision extends ResolvedModuleRevision {
  design: EmailDesignDocument
}
type Pin = EmailDesignDocument['dependencies'][number]
const keyOf = (pin: Pin) => `${pin.moduleId}:${pin.revisionId}`
const fail = (field: string): never => {
  throw new EmailDesignError('INVALID_DESIGN', field)
}

/** Resolve using the caller's transaction and fresh module-read authority.
 * The caller must separately authorise the root document and recheck write
 * authority at commit. These reads neither publish nor update mutable heads. */
export async function resolveStoredDesignDependencies(
  input: unknown,
  db: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> },
  authorizeModuleRead: (
    moduleId: string,
    clientId: string | null
  ) => Promise<void>
): Promise<ValidatedModuleRevision[]> {
  return resolveDesignDependencyClosure(input, async (moduleId, revisionId) => {
    if (
      !z.string().uuid().safeParse(moduleId).success
      || !z.string().uuid().safeParse(revisionId).success
    )
      fail('dependencies.identity')
    const row = (
      await db.query(
        `SELECT d.client_id, m.client_id AS owner_client_id, r.schema_version, r.payload
       FROM email_design_revisions r
       JOIN email_design_documents d ON d.id=r.document_id
       JOIN edm_custom_modules m ON m.id=d.module_id
       WHERE d.module_id=$1 AND r.id=$2`,
        [moduleId, revisionId]
      )
    ).rows[0] as
    | {
      client_id: string | null
      owner_client_id: string | null
      schema_version: number
      payload: unknown
    }
    | undefined
    if (!row) return fail('dependencies.identity')
    await authorizeModuleRead(moduleId, row.client_id)
    if (row.client_id !== row.owner_client_id) fail('dependencies.scope')
    if (row.schema_version !== 1) fail('dependencies.schemaVersion')
    const design = validateEmailDesign(row.payload)
    if (design.scope.clientId !== row.client_id) fail('dependencies.scope')
    return { moduleId, revisionId, design }
  })
}

/** The resolver must read the named immutable revision using current actor
 * authority. Never substitute a mutable library head. Scope is checked again
 * on every edge, including agency-wide modules nested in client documents. */
export async function resolveDesignDependencyClosure(
  input: unknown,
  resolve: (
    moduleId: string,
    revisionId: string
  ) => Promise<ResolvedModuleRevision>
): Promise<ValidatedModuleRevision[]> {
  const root = validateEmailDesign(input)
  const encoder = new TextEncoder()
  let totalBytes = encoder.encode(JSON.stringify(root)).byteLength
  const records = new Map<string, ValidatedModuleRevision>()
  const closures = new Map<string, Set<string>>()
  const active = new Set<string>()
  const assertDeclared = (
    document: EmailDesignDocument,
    actual: Set<string>
  ) => {
    const declared = new Set(document.dependencies.map(keyOf))
    if (
      declared.size !== actual.size
      || [...actual].some(key => !declared.has(key))
    )
      fail('dependencies.closure')
  }
  async function visit(
    pin: Pin,
    parentScope: string | null,
    depth: number
  ): Promise<Set<string>> {
    const key = keyOf(pin)
    if (depth > DESIGN_LIMITS.depth || active.has(key))
      fail('dependencies.cycleOrDepth')
    let record = records.get(key)
    if (!record) {
      if (records.size >= DESIGN_LIMITS.blocks) fail('dependencies.count')
      const resolved = await resolve(pin.moduleId, pin.revisionId)
      if (
        !resolved
        || resolved.moduleId !== pin.moduleId
        || resolved.revisionId !== pin.revisionId
      )
        fail('dependencies.identity')
      const design = validateEmailDesign(resolved.design)
      if (design.kind !== 'module') fail('dependencies.kind')
      totalBytes += encoder.encode(JSON.stringify(design)).byteLength
      if (totalBytes > DESIGN_LIMITS.documentBytes)
        throw new EmailDesignError('LIMIT_EXCEEDED', 'dependencies.bytes')
      record = { moduleId: pin.moduleId, revisionId: pin.revisionId, design }
      records.set(key, record)
    }
    if (
      record.design.scope.clientId !== null
      && record.design.scope.clientId !== parentScope
    )
      fail('dependencies.scope')
    const cached = closures.get(key)
    if (cached) return cached
    active.add(key)
    const closure = new Set<string>()
    for (const instance of record.design.moduleInstances) {
      closure.add(keyOf(instance))
      for (const child of await visit(
        instance,
        record.design.scope.clientId,
        depth + 1
      ))
        closure.add(child)
    }
    assertDeclared(record.design, closure)
    active.delete(key)
    closures.set(key, closure)
    return closure
  }
  const closure = new Set<string>()
  for (const instance of root.moduleInstances) {
    closure.add(keyOf(instance))
    for (const dependency of await visit(instance, root.scope.clientId, 1))
      closure.add(dependency)
  }
  assertDeclared(root, closure)
  return [...records.values()]
}
