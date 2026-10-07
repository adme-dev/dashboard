import { createEmailRenderer } from '../../server/utils/email-marketing/render/client'
import { handleEmailRender } from '../../workers/email-rendering/src/handleRender'

export const emailRendererEnv = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', EMAIL_RENDERER: { render: async (input: unknown) => handleEmailRender(input, 'staging') } }
export const testEmailRenderer = createEmailRenderer(emailRendererEnv)
