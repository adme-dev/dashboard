import { collectionStagingUpgradeContract } from './schemaUpgradeContract'
import { createSchemaUpgradeAuthority } from './schemaUpgradeAuthority'

export const {
  recheck: recheckPageStudioCollectionStagingAuthority,
  authorize: authorizePageStudioCollectionStagingUpgrade
} = createSchemaUpgradeAuthority(collectionStagingUpgradeContract)
