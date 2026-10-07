import { handleStandaloneWorkspace } from '~~/server/utils/pageStudio/standaloneWorkspaceHttp'

export default eventHandler(event => handleStandaloneWorkspace(event, 'asset'))
