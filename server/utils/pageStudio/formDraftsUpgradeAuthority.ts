import { formDraftsUpgradeContract } from './schemaUpgradeContract'
import { createSchemaUpgradeAuthority } from './schemaUpgradeAuthority'

export const { authorize: authorizePageStudioFormDraftsUpgrade } = createSchemaUpgradeAuthority(formDraftsUpgradeContract)
