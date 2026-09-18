import { randomUUID } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import { queryOneFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { ContentAttachmentRequestSchema } from '~~/shared/pageStudio/content-attachment'
import { samePageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import type { PageStudioCheckpointBucket } from '~~/shared/pageStudio/checkpointReader'
import { authorizePageStudioBusinessContent, type PageStudioContentActor } from './businessContent'
import { preparePageStudioContentAttachment } from './contentAttachmentIntent'
import { resolvePageStudioLoginSession } from './loginSessions'
import { requirePageStudioProvisioningRuntime } from './provisioningBinding'

interface Request { actor: PageStudioContentActor, event: H3Event, siteId: string, env: Record<string, unknown> }
interface Binding {
  resolveContentRoute: (scope: unknown) => Promise<unknown>
  readContentAttachment: (scope: unknown) => Promise<unknown>
  createContentAttachment: (request: unknown) => Promise<unknown>
}
const Body = z.object({ requestId: z.string().uuid(), expectedCheckpointId: ContentAttachmentRequestSchema.shape.anchor.shape.checkpointId }).strict()
const Status = z.enum(['connected', 'connecting', 'retry', 'disabled'])
const Retained = z.object({ request: ContentAttachmentRequestSchema, status: Status, leaseUntil: z.string().nullable() }).strict()
const unavailable = () => createError({ statusCode: 503, statusMessage: 'CMS connection is unavailable' })
const invalid = () => createError({ statusCode: 502, statusMessage: 'CMS connection could not be verified' })
async function context(request: Request) {
  const { scope } = await authorizePageStudioBusinessContent(request, true, {})
  const runtime = requirePageStudioProvisioningRuntime(request.env)
  const binding = runtime.binding as unknown as Binding
  if (scope.environment !== runtime.environment || typeof binding.resolveContentRoute !== 'function'
    || typeof binding.readContentAttachment !== 'function' || typeof binding.createContentAttachment !== 'function') throw unavailable()
  return { scope, binding, environment: runtime.environment }
}

export async function getPageStudioContentConnection(request: Request) {
  const { scope, binding } = await context(request)
  const route = await binding.resolveContentRoute(scope) as { scope?: unknown } | null
  if (route !== null) {
    const parsed = ContentAttachmentRequestSchema.shape.scope.safeParse(route?.scope)
    if (!parsed.success || !samePageStudioContentScope(parsed.data, scope)) throw invalid()
    await context(request)
    return { status: 'connected' as const }
  }
  const raw = await binding.readContentAttachment(scope)
  const retained = raw === null ? null : Retained.parse(raw)
  if (retained && !samePageStudioContentScope(retained.request.scope, scope)) throw invalid()
  const row = await queryOneFresh<{ current_checkpoint_id: string | null, metadata: { body?: unknown, intent?: unknown } | null }>(`
    SELECT site.current_checkpoint_id, (SELECT audit.metadata FROM page_studio_audit_events audit
      WHERE audit.tenant_id=site.tenant_id AND audit.client_id=site.client_id AND audit.site_id=site.id
        AND audit.action='content.attachment.requested' AND audit.resource_type='content_attachment' AND ($4::text IS NULL OR audit.resource_id=$4)
      ORDER BY audit.recorded_at ASC, audit.id ASC LIMIT 1) AS metadata
    FROM page_studio_sites site WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3`,
  [scope.tenantId, scope.clientId, scope.siteId, retained?.request.operationId ?? null])
  await context(request)
  if (!row) throw invalid()
  if (retained?.status === 'disabled') return { status: 'disabled' as const }
  if (!row.metadata) {
    if (retained || !row.current_checkpoint_id) return { status: 'reconciliation' as const }
    return { status: 'unconnected' as const, body: { requestId: randomUUID(), expectedCheckpointId: row.current_checkpoint_id } }
  }
  const saved = ContentAttachmentRequestSchema.parse(row.metadata.intent)
  if (!samePageStudioContentScope(saved.scope, scope)
    || (retained && saved.operationId !== retained.request.operationId)) throw invalid()
  const login = await transactionWithoutRetry(db => resolvePageStudioLoginSession(db, request.event, request.actor.role, request.actor.actorId))
  if (saved.actor.userId !== login.userId || saved.actor.loginSessionHash !== login.tokenHash
    || saved.actor.kind !== (request.actor.role === 'agency' ? 'agency-user' : 'client-user')) return { status: 'reconciliation' as const }
  return { status: retained?.status ?? 'retry', body: Body.parse(row.metadata.body) }
}

export async function connectPageStudioContent(request: Request & { body: unknown }) {
  const { binding, environment } = await context(request)
  const bucket = request.env.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket | undefined
  if (typeof bucket?.get !== 'function') throw unavailable()
  const saved = await preparePageStudioContentAttachment({ ...request, environment, bucket, artifacts: {
    schemaDigest: request.env.PAGE_STUDIO_CONTENT_ATTACHMENT_SCHEMA_DIGEST,
    runtimeDigest: request.env.PAGE_STUDIO_CONTENT_ATTACHMENT_RUNTIME_DIGEST,
    policyVersion: 'content-attachment-v1'
  } })
  const result = z.object({ operationId: z.string(), status: z.enum(['connected', 'connecting']) }).strict().parse(await binding.createContentAttachment(saved.intent))
  if (result.operationId !== saved.intent.operationId) throw invalid()
  return { status: result.status }
}
