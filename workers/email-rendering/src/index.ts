import { WorkerEntrypoint } from 'cloudflare:workers'
import type { EmailRenderingStagingEnv } from '../worker-staging'
import type { EmailRenderingProductionEnv } from '../worker-production'
import { handleEmailRender } from './handleRender'

type Env = EmailRenderingStagingEnv | EmailRenderingProductionEnv
export class EmailRenderer extends WorkerEntrypoint<Env> {
  fetch() { return new Response('Not found', { status: 404 }) }
  async render(input: unknown) {
    return handleEmailRender(input, this.env.EMAIL_RENDER_ENVIRONMENT)
  }
}
export default {
  fetch() { return new Response('Not found', { status: 404 }) }
}
