import { formDraftsRuntimeContract } from './schemaUpgradeContract'
import { createSchemaUpgradeAuthority } from './schemaUpgradeAuthority'

export const { authorize: authorizePageStudioFormDraftsRuntime } = createSchemaUpgradeAuthority(formDraftsRuntimeContract)
