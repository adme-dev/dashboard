import { collectionUpgradeContract } from './schemaUpgradeContract'
import { createSchemaUpgradePreparation } from './schemaUpgradeIntent'
import { recheckPageStudioCollectionAuthority } from './collectionUpgradeAuthority'

export const preparePageStudioCollectionUpgrade = createSchemaUpgradePreparation(collectionUpgradeContract, recheckPageStudioCollectionAuthority)
