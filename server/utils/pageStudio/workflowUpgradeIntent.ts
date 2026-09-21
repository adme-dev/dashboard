import { workflowUpgradeContract } from './schemaUpgradeContract'
import { createSchemaUpgradePreparation } from './schemaUpgradeIntent'
import { recheckPageStudioWorkflowAuthority } from './workflowUpgradeAuthority'

export const preparePageStudioWorkflowUpgrade = createSchemaUpgradePreparation(workflowUpgradeContract, recheckPageStudioWorkflowAuthority)
