import { readFile } from 'node:fs/promises'
import { beforeEach, expect, it, vi } from 'vitest'
import { readAcceptedFormActions } from '~~/server/utils/pageStudio/formActionDiscovery'

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), current: vi.fn(), artifact: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/cmsGraphCoordinator', () => ({
  readCmsGraphSnapshot: mocks.snapshot,
  assertCmsGraphSnapshotCurrent: mocks.current
}))
vi.mock('~~/server/utils/pageStudio/cmsGraphStorage', () => ({
  createCmsGraphStorage: () => ({ readArtifact: mocks.artifact })
}))
const fixtures = JSON.parse(
  await readFile(
    new URL('../../../shared/pageStudio/generated/builderGraphFixtures.json', import.meta.url),
    'utf8'
  )
)
const fixture = fixtures.find(
  (entry: { name: string }) => entry.name === 'typed action input'
).input
const principal = {
  source: 'studio-session',
  claims: { siteId: 'site_test' },
  env: {},
  capability: 'workspace:checkpoint'
} as never
function snapshot() {
  return {
    scope: fixture.scope,
    context: {
      application: {
        id: '11111111-1111-4111-8111-111111111111',
        digest: 'a'.repeat(64),
        manifest: { actions: [fixture.actionPin] }
      }
    },
    checkpoint: { id: 'checkpoint_one', digest: 'b'.repeat(64), object_key: 'private/checkpoint' }
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.snapshot.mockResolvedValue(snapshot())
  mocks.artifact.mockResolvedValue(fixture.artifactBytes)
  mocks.current.mockResolvedValue(undefined)
})
it('returns only finite accepted action descriptors after fresh snapshot recheck', async () => {
  const result = await readAcceptedFormActions(principal)
  expect(result).toEqual({
    version: 1,
    scope: fixture.scope,
    application: { id: snapshot().context.application.id, digest: 'a'.repeat(64) },
    checkpoint: { id: 'checkpoint_one', digest: 'b'.repeat(64) },
    actions: [
      {
        pin: fixture.actionPin,
        label: 'Submit',
        inputContract: {
          version: 1,
          properties: [{ key: 'title', type: 'string', required: true }]
        }
      }
    ]
  })
  expect(mocks.artifact).toHaveBeenCalledWith(fixture.actionPin)
  expect(mocks.current).toHaveBeenCalledOnce()
  expect(JSON.stringify(result)).not.toContain('source')
  expect(JSON.stringify(result)).not.toContain('object_key')
})
it('denies altered accepted artifact bytes rather than returning a descriptor', async () => {
  mocks.artifact.mockResolvedValue(fixture.artifactBytes.replace('input => input', 'input => null'))
  await expect(readAcceptedFormActions(principal)).rejects.toThrow()
})
it('returns no descriptors when accepted application has no actions', async () => {
  const value = snapshot()
  value.context.application.manifest.actions = []
  mocks.snapshot.mockResolvedValue(value)
  expect((await readAcceptedFormActions(principal)).actions).toEqual([])
  expect(mocks.artifact).not.toHaveBeenCalled()
  expect(mocks.current).toHaveBeenCalledOnce()
})
it('denies a changed application or revoked principal after artifact reads', async () => {
  mocks.current.mockRejectedValue(new Error('Current snapshot changed'))
  await expect(readAcceptedFormActions(principal)).rejects.toThrow('Current snapshot changed')
})
it('never reads private artifacts if initial authorization fails', async () => {
  mocks.snapshot.mockRejectedValue(new Error('Denied'))
  await expect(readAcceptedFormActions(principal)).rejects.toThrow('Denied')
  expect(mocks.artifact).not.toHaveBeenCalled()
})
