import { handleCustomerEditorAuthorityFetch } from './customerEditorAuthority'
import { CUSTOMER_EDITOR_AUTHORITY_URL, CUSTOMER_EDITOR_CHECKPOINT_URL } from '../../../shared/pageStudio/customerEditorAuthorityTransport'
import { handleNativeSchemaCoordinatorFetch } from './nativeSchemaCoordinator'
import { NATIVE_SCHEMA_COORDINATOR_URL } from '../../../shared/pageStudio/nativeSchemaCoordinator'
import { handleNativeSchemaAuthorityFetch } from './nativeSchemaAuthority'
import { handleNativeRuntimeRecoveryFetch, handleNativeRuntimeRecoveryRpc } from './nativeRuntimeRecoveryTransport'
import { NATIVE_RUNTIME_RECOVERY_AUTHORITY_URL } from '../../../shared/pageStudio/nativeRuntimeRecoveryWire'
import { handleTransferControls } from './transferControls'
import { handleTransferWorkflow } from './transferWorkflow'
import { handleManagedTransferPreparation } from './managedTransferPreparation'
import { handleCompletedManagedTransferManagement, handleManagedTransferFinalization } from './completedManagedTransferManagement'
import { handleManagedTransferSourceRetentionManagement } from './managedTransferSourceRetentionManagement'
import { handleManagedTransferDestinationAuthoringManagement } from './managedTransferDestinationAuthoringManagement'
import { handleManagedTransferCopyExecutionManagement } from './managedTransferCopyExecutionManagement'
import { handleManagedTransferCopyManagement } from './managedTransferCopyManagement'
import { handleCmsManagement } from './cmsManagement'
import { handleCmsStatusFetch } from './cmsStatus'
import { CMS_STATUS_URL } from '../../../shared/pageStudio/cmsManagementContract'
import { handleInspection } from './inspection'
import { WorkerEntrypoint } from 'cloudflare:workers'
import type { ManagementStagingEnv } from '../worker-staging'
import type { ManagementProductionEnv } from '../worker-production'
import { z } from 'zod'
import { PageStudioEmailEditSchema, PageStudioEmailStateSchema } from '../../../shared/pageStudio/emailConfiguration'
import { PageStudioEmailConfigurationError } from '../../../shared/pageStudio/emailConfigurationContract'
import { readPageStudioEmailConfiguration, writePageStudioEmailConfiguration } from './emailConfiguration'
import { withManagementTransaction } from './database'
import { handleDomainManagement } from './domainManagement'
import type { DomainDatabase } from './domainAttachment'
import { handleStagingManagement, handleCheckpointStaging } from './stagingManagement'
import { handleContentAttachmentCompletion } from './contentAttachmentCompletion'
import { resolveStagingHost } from './stagingRead'

type Env = ManagementStagingEnv | ManagementProductionEnv
const Actor = z.discriminatedUnion('role', [
  z.object({ role: z.literal('agency'), actorId: z.string().uuid(), tenantId: z.string().min(1).max(128), canEdit: z.boolean() }).strict(),
  z.object({ role: z.literal('client'), actorId: z.string().uuid(), clientId: z.string().uuid() }).strict()
])
const scope = { actor: Actor, siteId: z.string().uuid(), expectedEnvironment: z.enum(['staging', 'production']) }
const Request = z.discriminatedUnion('operation', [
  z.object({ ...scope, operation: z.literal('read') }).strict(),
  z.object({ ...scope, operation: z.literal('write'), body: PageStudioEmailEditSchema }).strict()
])
const rejected = (code: string, statusCode: number, message: string) => ({ ok: false as const, error: { code, statusCode, message } })
export default class PageStudioManagement extends WorkerEntrypoint<Env> {
  fetch(request: Request) {
    if (request.url === CMS_STATUS_URL) return handleCmsStatusFetch(request, this.env as unknown as Record<string, unknown>,
      work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
    if (request.url === CUSTOMER_EDITOR_AUTHORITY_URL || request.url === CUSTOMER_EDITOR_CHECKPOINT_URL) return handleCustomerEditorAuthorityFetch(request, this.env as unknown as Record<string, unknown>,
      work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
    if (request.url === NATIVE_SCHEMA_COORDINATOR_URL) return handleNativeSchemaCoordinatorFetch(request, this.env as unknown as Record<string, unknown>,
      work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
    if (request.url === NATIVE_RUNTIME_RECOVERY_AUTHORITY_URL) return handleNativeRuntimeRecoveryFetch(request, this.env as unknown as Record<string, unknown>,
      work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
    return handleNativeSchemaAuthorityFetch(request, this.env,
      work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async nativeRuntimeRecovery(input: unknown) {
    return handleNativeRuntimeRecoveryRpc(input, this.env as unknown as Record<string, unknown>,
      work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async transferControls(input: unknown) {
    return handleTransferControls(input, this.env as unknown as Record<string, unknown>, work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async transferWorkflow(input: unknown) {
    return handleTransferWorkflow(input, this.env as unknown as Record<string, unknown>, work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async completedManagedTransfer(input: unknown) {
    return handleCompletedManagedTransferManagement(input, this.env as unknown as Record<string, unknown>, work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async managedTransferFinalization(input: unknown) {
    return handleManagedTransferFinalization(input, this.env as unknown as Record<string, unknown>, work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async managedTransferSourceRetention(input: unknown) {
    return handleManagedTransferSourceRetentionManagement(input, this.env as unknown as Record<string, unknown>, work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async managedTransferDestinationAuthoring(input: unknown) {
    return handleManagedTransferDestinationAuthoringManagement(input, this.env as unknown as Record<string, unknown>, work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async managedTransferCopyGraphExecution(input: unknown) {
    return handleManagedTransferCopyExecutionManagement(input, this.env as unknown as Record<string, unknown>, work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async managedTransferPreparation(input: unknown) {
    return handleManagedTransferPreparation(input, this.env as unknown as Record<string, unknown>, work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async managedTransferCopyGraph(input: unknown) {
    return handleManagedTransferCopyManagement(input, this.env as unknown as Record<string, unknown>, work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async cmsAuthoring(input: unknown) {
    return handleCmsManagement(input, this.env as unknown as Record<string, unknown>, work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async clientStaging(input: unknown) {
    return handleStagingManagement(input, this.env as unknown as Record<string, unknown>, work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async checkpointStaging(input: unknown) {
    return handleCheckpointStaging(input, this.env as unknown as Record<string, unknown>, work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async resolveClientStaging(hostname: string) {
    // Customer previews belong to the real customer control plane. The shared
    // infrastructure staging environment must never resolve production sites.
    if (this.env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production') return null
    return withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => resolveStagingHost(db as unknown as DomainDatabase, hostname))
  }

  async inspectWebsite(input: unknown) {
    return handleInspection(input, this.env as unknown as Record<string, unknown>, work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async domains(input: unknown) {
    return handleDomainManagement(input, this.env as unknown as Record<string, unknown>, work => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, db => work(db as unknown as DomainDatabase)))
  }

  async emailSettings(input: unknown) {
    const parsed = Request.safeParse(input)
    if (!parsed.success) return rejected('EMAIL_INVALID', 400, 'Invalid website email settings request')
    const environment = this.env.PAGE_STUDIO_RELEASE_ENVIRONMENT
    if (!['staging', 'production'].includes(environment) || parsed.data.expectedEnvironment !== environment || !this.env.HYPERDRIVE_FRESH?.connectionString) {
      return rejected('EMAIL_NOT_CONFIGURED', 503, 'Website email settings environment is unavailable')
    }
    const request = { actor: parsed.data.actor, siteId: parsed.data.siteId, env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: environment } }
    const dependencies = { transaction: <T>(work: Parameters<typeof withManagementTransaction<T>>[1]) => withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, work) }
    try {
      const value = parsed.data.operation === 'read' ? await readPageStudioEmailConfiguration(request, dependencies) : await writePageStudioEmailConfiguration({ ...request, body: parsed.data.body }, dependencies)
      return { ok: true as const, value: PageStudioEmailStateSchema.parse(value) }
    } catch (error) {
      if (error instanceof PageStudioEmailConfigurationError) return rejected(error.code, error.statusCode, error.message)
      console.error(JSON.stringify({ event: 'page_studio_management_failure', operation: parsed.data.operation, environment }))
      return rejected('EMAIL_SERVICE_UNAVAILABLE', 503, 'Website email settings service is unavailable')
    }
  }
}

/** Dedicated capability: callers of this entrypoint cannot invoke management writes. */
export class ContentAttachmentAuthority extends WorkerEntrypoint<Env> {
  fetch() { return new Response('Not found', { status: 404 }) }

  async readCompletion(input: unknown) {
    return handleContentAttachmentCompletion(input, this.env.PAGE_STUDIO_RELEASE_ENVIRONMENT, async (sql, params) => {
      if (!this.env.HYPERDRIVE_FRESH?.connectionString) throw new Error('Fresh database unavailable')
      return withManagementTransaction(this.env.HYPERDRIVE_FRESH.connectionString, async (db) => {
        const result = await db.query(sql, params)
        if (result.rows.length > 1) throw new Error('Ambiguous completion')
        const row = result.rows[0]
        return row ? { metadata: row.metadata } : null
      })
    })
  }
}
