import { workflowUpgradeContract } from './schemaUpgradeContract'
import { createSchemaUpgradeSetup } from './schemaUpgradeSetupHttp'
import { preparePageStudioWorkflowUpgrade } from './workflowUpgradeIntent'
import { authorizePageStudioWorkflowUpgrade } from './workflowUpgradeAuthority'

export const handlePageStudioWorkflowSetup = createSchemaUpgradeSetup(workflowUpgradeContract, preparePageStudioWorkflowUpgrade, authorizePageStudioWorkflowUpgrade)
