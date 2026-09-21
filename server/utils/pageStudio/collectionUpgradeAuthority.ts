import { collectionUpgradeContract } from './schemaUpgradeContract'
import { createSchemaUpgradeAuthority } from './schemaUpgradeAuthority'

export const { recheck: recheckPageStudioCollectionAuthority, authorize: authorizePageStudioCollectionUpgrade } = createSchemaUpgradeAuthority(collectionUpgradeContract)
