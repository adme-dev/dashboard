import { expect, it } from 'vitest'
import { decodeCmsContext, decodeRetainedCmsContext } from '~~/server/utils/pageStudio/cmsVisibility'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import fixture from '../../fixtures/pageStudioCmsGraph.json'

async function row() {
  const { scope, application, generation, target, freezeDigest } = fixture.base
  const key = contentScopeKey(scope)
  return { scope, value: { state: { scope_key: key, tenant_id: scope.tenantId, client_id: scope.clientId,
    business_id: scope.businessId, site_id: scope.siteId, environment: scope.environment, state: 'retained',
    active_generation: generation, target, freeze_digest: freezeDigest, current_application_id: application.manifest.applicationId, current_content_id: null },
  application: { id: application.manifest.applicationId, generation, scope_key: key, digest: await collectionDigest(application.manifest),
    manifest: application.manifest, previous_application_id: application.manifest.previousApplicationId },
  selections: application.manifest.schemas.map(s => ({ collection_id: s.collectionId, object_id: s.objectId })) } }
}
it('decodes actual retained data without widening the ordinary managed decoder', async () => {
  const f = await row()
  expect((await decodeRetainedCmsContext(f.value, f.scope)).state.state).toBe('retained')
  await expect(decodeCmsContext(f.value, f.scope)).rejects.toThrow()
})
it.each(['generation', 'scope', 'digest', 'selection', 'state'])('rejects corrupted retained %s data', async (field) => {
  const f = await row()
  if (field === 'generation') f.value.application.generation = '10000000-0000-4000-8000-000000000001'
  if (field === 'scope') f.value.state.site_id = '10000000-0000-4000-8000-000000000001'
  if (field === 'digest') f.value.application.digest = '0'.repeat(64)
  if (field === 'selection') f.value.selections.push({ collection_id: 'other', object_id: '10000000-0000-4000-8000-000000000001' })
  if (field === 'state') f.value.state.state = 'managed'
  await expect(decodeRetainedCmsContext(f.value, f.scope)).rejects.toThrow()
})
