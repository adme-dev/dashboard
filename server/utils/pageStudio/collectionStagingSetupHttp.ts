import { collectionStagingUpgradeContract } from './schemaUpgradeContract'
import { createSchemaUpgradeSetup } from './schemaUpgradeSetupHttp'
import { preparePageStudioCollectionStagingUpgrade } from './collectionStagingUpgradeIntent'
import { authorizePageStudioCollectionStagingUpgrade } from './collectionStagingUpgradeAuthority'

export const handlePageStudioCollectionStagingSetup = createSchemaUpgradeSetup(
  collectionStagingUpgradeContract,
  preparePageStudioCollectionStagingUpgrade,
  authorizePageStudioCollectionStagingUpgrade
)
