import { expect, it } from 'vitest'
import fixture from '../../fixtures/pageStudioManagedTransferDestinationAuthoring.json'
import { planManagedTransferDestinationAuthoring, requireMatchingManagedTransferDestinationAuthoringGrant } from '~~/shared/pageStudio/managed-transfer-destination-authoring'

it('matches the canonical Studio same-fixture complete request and grant exactly', async () => {
  expect(await planManagedTransferDestinationAuthoring(fixture.request)).toEqual({ request: fixture.request, grant: fixture.grant })
  expect(await requireMatchingManagedTransferDestinationAuthoringGrant(fixture.grant, fixture.request)).toEqual(fixture.grant)
})
