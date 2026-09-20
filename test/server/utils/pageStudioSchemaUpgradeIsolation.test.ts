import { describe, expect, it, vi } from 'vitest'
import { authorizePageStudioCollectionUpgrade } from '~~/server/utils/pageStudio/collectionUpgradeAuthority'
import { authorizePageStudioWorkflowUpgrade } from '~~/server/utils/pageStudio/workflowUpgradeAuthority'
import collection from './fixtures/collection-upgrade-v1.json'
import workflow from './fixtures/workflow-upgrade-v1.json'

describe('shared schema-upgrade implementation keeps native grants separate', () => {
  it.each([
    [authorizePageStudioCollectionUpgrade, workflow.intent],
    [authorizePageStudioWorkflowUpgrade, collection.intent]
  ] as const)('rejects the other upgrade contract before native admission', async (authorize, intent) => {
    const read = vi.fn()
    await expect(authorize(intent, 'staging', { read })).rejects.toMatchObject({ statusCode: 403 })
    expect(read).not.toHaveBeenCalled()
  })
  it.each([
    [authorizePageStudioCollectionUpgrade, collection.intent, collection.identity, 'collection'],
    [authorizePageStudioWorkflowUpgrade, workflow.intent, workflow.identity, 'workflow']
  ] as const)('uses only its own retained audit and cancellation namespace', async (authorize, intent, identity, kind) => {
    const read = vi.fn(async (_sql: string, _params: unknown[]) => [{
      plan_metadata: { builder: { collectionSchemas: true }, allowedModules: ['business-content'] },
      metadata: { intent, identity },
      actor_id: intent.actor.userId,
      actor_role: intent.actor.kind === 'agency-user' ? 'agency' : 'client'
    }])
    expect(await authorize(intent, 'staging', { read })).toEqual(intent)
    const sql = read.mock.calls[0]![0]
    expect(sql).toContain(`content.${kind}-upgrade.requested`)
    expect(sql).toContain(`content.${kind}-upgrade.disabled`)
    expect(sql).toContain(`resource_type='${kind}_upgrade'`)
    expect(sql).not.toContain(`content.${kind === 'collection' ? 'workflow' : 'collection'}-upgrade`)
  })
})
