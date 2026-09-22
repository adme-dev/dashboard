import { collectionStagingUpgradeContract } from './schemaUpgradeContract'
import { createSchemaUpgradePreparation } from './schemaUpgradeIntent'
import { recheckPageStudioCollectionStagingAuthority } from './collectionStagingUpgradeAuthority'

export const preparePageStudioCollectionStagingUpgrade = createSchemaUpgradePreparation(
  collectionStagingUpgradeContract,
  recheckPageStudioCollectionStagingAuthority
)
