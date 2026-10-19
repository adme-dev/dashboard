import { z } from 'zod'
import { CmsPreparationSchema, CmsObjectPinSchema } from '../../../shared/pageStudio/cmsManaged'
import type { CopyContextSchema } from '../../../workers/page-studio-management/src/transfer/copyGraphContract'
import { CopyGraphProofSchema } from '../../../workers/page-studio-management/src/transfer/copyGraphContract'
import { collectionCanonical as canonical, collectionDigest as digest } from '../../../shared/pageStudio/collectionApi'
import { planNativeManagedTransferCopyGraph } from '../../../workers/page-studio-management/src/generated/managed-transfer-copy/managedTransferCopyVerifier.mjs'

async function withDigest<T extends object>(body: T) {
  return { ...body, digest: await digest(body) }
}
/** Test-only physical observation fixture. Full native verifier checks its bytes;
 * adversarial cases alter and rehash these observations independently. */
export async function managedTransferCopyGraphReady(context: z.infer<typeof CopyContextSchema>) {
  const plan = z.object({
    preparations: z.array(z.object({ preparation: CmsPreparationSchema, expected: CmsObjectPinSchema })),
    objects: z.array(z.object({ source: CmsObjectPinSchema, destination: CmsObjectPinSchema })),
    graph: CopyGraphProofSchema.shape.graphReceipt.shape.graph,
    graphRequest: z.unknown()
  }).parse(await planNativeManagedTransferCopyGraph(context))
  const operations = await Promise.all(plan.preparations.map(async p => withDigest({
    createdAt: '2026-10-16T01:00:00.000Z', freezeDigest: p.preparation.freezeDigest, items: [p.expected], operationId: p.preparation.operationId,
    requestDigest: await digest(p.preparation), scope: p.preparation.scope, state: 'prepared'
  })))
  const destinationObjects = plan.preparations.map((p, i) => ({ actorId: context.admission.copy.actor.userId, body: p.preparation.items[0].body,
    createdAt: operations[i].createdAt, head: false, pin: p.expected, schema: p.preparation.items[0].kind === 'record' ? p.preparation.items[0].schema : null }))
  const copyReceipt = await withDigest({ contentHead: plan.objects.find(p => canonical(p.source) === canonical(context.admission.copy.source.contentHead))?.destination ?? null,
    formatVersion: 1, freeze: context.admission.copy.destination.freezeReceipt, objects: plan.objects, operations,
    requestDigest: await digest(context.admission.copy), state: 'prepared' })
  const s = context.admission.destinationGraph.scope
  const graphReceipt = await withDigest({ checkpoint: { digest: plan.graph.base.checkpoint.digest, etag: 'actual-copy-checkpoint-etag',
    objectKey: `tenants/${s.tenantId}/clients/${s.clientId}/sites/${s.siteId}/checkpoints/${plan.graph.base.checkpoint.id}.json` },
  graph: plan.graph, requestDigest: await digest(plan.graphRequest), state: 'prepared', version: 1 })
  const reference = { operationId: context.operationId, intentDigest: context.intentDigest, requestDigest: await digest(context.admission), contextDigest: await digest(context) }
  return { ...reference, state: 'ready', proof: await withDigest({ formatVersion: 1, ...reference, copyReceipt, graphReceipt, destinationObjects }) }
}
