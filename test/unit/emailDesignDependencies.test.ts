import { describe, expect, it } from 'vitest'
import { resolveDesignDependencyClosure } from '../../server/utils/email-marketing/designDependencies'
import {
  structuredDesign,
  type MutableDesignFixture
} from '../fixtures/email-design/structured'

const pin = (moduleId: string) => ({ moduleId, revisionId: `rev-${moduleId}` })
function moduleDesign(child?: string): MutableDesignFixture {
  const design: MutableDesignFixture = structuredDesign()
  design.kind = 'module'
  delete design.blocks.root
  delete design.blocks.cta
  design.rootChildrenIds = ['heading']
  design.lineage = [design.lineage[0]]
  design.policy.editableFields = ['heading.data.props.text']
  design.dependencies = child ? [pin(child)] : []
  design.moduleInstances = child
    ? [
        {
          instanceId: 'nested',
          ...pin(child),
          rootBlockIds: ['heading'],
          overrides: {}
        }
      ]
    : []
  return design
}
function template(dependencies = [pin('a')]): MutableDesignFixture {
  return {
    ...structuredDesign(),
    dependencies,
    moduleInstances: [
      {
        instanceId: 'one',
        ...pin('a'),
        rootBlockIds: ['heading'],
        overrides: {}
      }
    ]
  }
}
describe('immutable module dependency closure', () => {
  it('resolves exact pinned revisions and retains declared transitive dependencies', async () => {
    const sources: Record<string, MutableDesignFixture> = {
      a: moduleDesign('b'),
      b: moduleDesign()
    }
    const result = await resolveDesignDependencyClosure(
      template([pin('a'), pin('b')]),
      async (id, revision) => ({
        moduleId: id,
        revisionId: revision,
        design: sources[id]
      })
    )
    expect(result.map(item => item.moduleId).sort()).toEqual(['a', 'b'])
  })
  it('rejects an omitted transitive revision', async () => {
    await expect(
      resolveDesignDependencyClosure(template(), async (id, revision) => ({
        moduleId: id,
        revisionId: revision,
        design: moduleDesign(id === 'a' ? 'b' : undefined)
      }))
    ).rejects.toThrow()
  })
  it('rejects an unused pin rather than treating declarations as proof', async () => {
    await expect(
      resolveDesignDependencyClosure(
        template([pin('a'), pin('unused')]),
        async (id, revision) => ({
          moduleId: id,
          revisionId: revision,
          design: moduleDesign()
        })
      )
    ).rejects.toThrow()
  })
  it('rejects dependency cycles', async () => {
    await expect(
      resolveDesignDependencyClosure(
        template([pin('a'), pin('b')]),
        async (id, revision) => ({
          moduleId: id,
          revisionId: revision,
          design: moduleDesign(id === 'a' ? 'b' : 'a')
        })
      )
    ).rejects.toThrow()
  })
  it('rejects a resolver returning the latest revision instead of the requested pin', async () => {
    await expect(
      resolveDesignDependencyClosure(template(), async id => ({
        moduleId: id,
        revisionId: 'latest',
        design: moduleDesign()
      }))
    ).rejects.toThrow()
  })
  it('rejects foreign-client module content', async () => {
    const design = moduleDesign()
    design.scope.clientId = '20000000-0000-4000-8000-000000000002'
    await expect(
      resolveDesignDependencyClosure(template(), async (id, revision) => ({
        moduleId: id,
        revisionId: revision,
        design
      }))
    ).rejects.toThrow()
  })
  it('allows an authorised agency-wide module in a client document', async () => {
    const design = moduleDesign()
    design.scope.clientId = null
    expect(
      await resolveDesignDependencyClosure(
        template(),
        async (id, revision) => ({
          moduleId: id,
          revisionId: revision,
          design
        })
      )
    ).toHaveLength(1)
  })
  it('does not permit a shared module to depend on client-owned content', async () => {
    const design = template()
    design.scope.clientId = null
    await expect(
      resolveDesignDependencyClosure(design, async (id, revision) => ({
        moduleId: id,
        revisionId: revision,
        design: moduleDesign()
      }))
    ).rejects.toThrow()
  })
  it('checks a shared module dependency against its own scope, not the outer client', async () => {
    const shared = moduleDesign('b')
    shared.scope.clientId = null
    await expect(
      resolveDesignDependencyClosure(
        template([pin('a'), pin('b')]),
        async (id, revision) => ({
          moduleId: id,
          revisionId: revision,
          design: id === 'a' ? shared : moduleDesign()
        })
      )
    ).rejects.toThrow()
  })
  it('bounds the aggregate bytes of individually valid module revisions', async () => {
    const input: MutableDesignFixture = structuredDesign()
    input.blocks = { root: { type: 'EmailLayout', data: { childrenIds: [] } } }
    input.lineage = []
    input.policy.editableFields = []
    input.dependencies = []
    input.moduleInstances = []
    for (let i = 0; i < 6; i++) {
      const id = `m${i}`
      input.blocks[id] = {
        type: 'Text',
        data: { props: { text: 'Instance' } }
      }
      input.blocks.root.data.childrenIds.push(id)
      input.dependencies.push(pin(id))
      input.moduleInstances.push({
        instanceId: id,
        ...pin(id),
        rootBlockIds: [id],
        overrides: {}
      })
    }
    await expect(
      resolveDesignDependencyClosure(input, async (id, revision) => {
        const design = moduleDesign()
        design.blocks.heading.data.props.text = 'x'.repeat(400_000)
        return { moduleId: id, revisionId: revision, design }
      })
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' })
  })
})
