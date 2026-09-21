import { handlePageStudioWorkflowSetup } from '~~/server/utils/pageStudio/workflowSetupHttp'

export default eventHandler(event => handlePageStudioWorkflowSetup(event, 'portal', 'GET'))
