import { handlePageStudioWorkflowSetup } from '~~/server/utils/pageStudio/workflowSetupHttp'

export default eventHandler(event => handlePageStudioWorkflowSetup(event, 'agency', 'POST'))
