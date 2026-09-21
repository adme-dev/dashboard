import { collectionUpgradeContract } from './schemaUpgradeContract'
import { createSchemaUpgradeSetup } from './schemaUpgradeSetupHttp'
import { preparePageStudioCollectionUpgrade } from './collectionUpgradeIntent'
import { authorizePageStudioCollectionUpgrade } from './collectionUpgradeAuthority'

export const handlePageStudioCollectionSetup = createSchemaUpgradeSetup(collectionUpgradeContract, preparePageStudioCollectionUpgrade, authorizePageStudioCollectionUpgrade)
