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
  fetch() { return new Response('Not found', { status: 404 }) }
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
