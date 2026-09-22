import { z } from 'zod'
import { CollectionDefinitionSchema } from '~~/shared/pageStudio/collectionDefinition'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { readCmsGraphSnapshot, assertCmsGraphSnapshotCurrent, cmsGraphEnvironment, cmsGraphConflict, type CmsGraphPrincipal, type CmsGraphDependencies } from './cmsGraphCoordinator'
import { createCmsGraphStorage } from './cmsGraphStorage'
import { withCmsCommitAuthority } from './cmsCommitAuthority'
import type { BuilderGraphPin } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'

export const ManagedFeatureContextRequestSchema = z.object({ mode: z.enum(['full', 'check']) }).strict()

/** Private model-host context. No record values or author credentials are returned. */
export async function readManagedFeatureContext(raw: unknown, principal: CmsGraphPrincipal, deps: CmsGraphDependencies = {}) {
  const { mode } = ManagedFeatureContextRequestSchema.parse(raw)
  const snapshot = await readCmsGraphSnapshot(principal, deps)
  const metadata = { version: 1 as const, mode, scope: snapshot.scope,
    application: { id: snapshot.context.application.id, digest: snapshot.context.application.digest },
    checkpoint: { id: snapshot.checkpoint.id, digest: snapshot.checkpoint.digest },
    contentRevision: snapshot.content?.pin.version ?? 0 }
  if (mode === 'check') return metadata
  if (snapshot.schemas.length) await withCmsCommitAuthority({ scope: snapshot.scope, principal, mutation: 'collection-record' }, async () => {}, deps)
  const storage = createCmsGraphStorage(cmsGraphEnvironment(principal), snapshot)
  const pins: BuilderGraphPin[] = [...snapshot.context.application.manifest.components, ...snapshot.context.application.manifest.actions]
  const artifactBytes: string[] = []
  let total = 0
  const add = (raw: string) => {
    total += new TextEncoder().encode(raw).byteLength
    if (total > 2_000_000 || artifactBytes.length >= 128) throw cmsGraphConflict('The selected feature library exceeds the generation budget.')
    artifactBytes.push(raw)
  }
  for (const pin of pins) add(await storage.readArtifact(pin))
  for (const object of await storage.readObjects(snapshot.schemas.map(item => item.pin))) {
    const definition = CollectionDefinitionSchema.parse(object.body)
    const artifact = { kind: 'collection', definition }
    add(collectionCanonical(artifact))
    pins.push({ kind: 'collection', id: definition.id, version: definition.version, sha256: await collectionDigest(artifact) })
  }
  await assertCmsGraphSnapshotCurrent(snapshot, principal, deps)
  if (snapshot.schemas.length) await withCmsCommitAuthority({ scope: snapshot.scope, principal, mutation: 'collection-record' }, async () => {}, deps)
  return { ...metadata, mode: 'full' as const, pins, artifactBytes }
}
