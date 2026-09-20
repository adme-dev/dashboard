import { workflowUpgradeContract } from './schemaUpgradeContract'
import { createSchemaUpgradeAuthority } from './schemaUpgradeAuthority'

export const { recheck: recheckPageStudioWorkflowAuthority, authorize: authorizePageStudioWorkflowUpgrade } = createSchemaUpgradeAuthority(workflowUpgradeContract)
