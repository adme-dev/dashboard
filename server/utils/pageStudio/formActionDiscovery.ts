import { verifyBuilderFormActionDescriptor } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { readCmsGraphSnapshot, assertCmsGraphSnapshotCurrent } from './cmsGraphCoordinator'
import { createCmsGraphStorage } from './cmsGraphStorage'

/** Authenticated editor metadata only. Neither descriptors nor their pins grant execution. */
export async function readAcceptedFormActions(
  principal: Parameters<typeof readCmsGraphSnapshot>[0],
  dependencies?: Parameters<typeof readCmsGraphSnapshot>[1]
) {
  const snapshot = await readCmsGraphSnapshot(principal, dependencies)
  const env = principal.source === 'native-login' ? principal.request.env : principal.env
  const storage = createCmsGraphStorage(env ?? {}, snapshot)
  const actions = []
  for (const pin of snapshot.context.application.manifest.actions) {
    const descriptor = await verifyBuilderFormActionDescriptor({
      scope: snapshot.scope,
      actionPin: pin,
      artifactBytes: await storage.readArtifact(pin)
    })
    if (descriptor) actions.push(descriptor)
  }
  const response = {
    version: 1 as const,
    scope: snapshot.scope,
    application: {
      id: snapshot.context.application.id,
      digest: snapshot.context.application.digest
    },
    checkpoint: { id: snapshot.checkpoint.id, digest: snapshot.checkpoint.digest },
    actions
  }
  if (new TextEncoder().encode(JSON.stringify(response)).byteLength > 1_048_576)
    throw new Error('Form action catalogue exceeds the response limit')
  await assertCmsGraphSnapshotCurrent(snapshot, principal, dependencies)
  return response
}
