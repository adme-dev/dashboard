import type { BannerRendererProductionEnv } from '../worker-production'
import type { BannerRendererStagingEnv } from '../worker-staging'
import { WorkerEntrypoint } from 'cloudflare:workers'
import { renderWithBinding } from './render'

type BannerRendererEnv = BannerRendererProductionEnv | BannerRendererStagingEnv
export class BannerRenderer extends WorkerEntrypoint<BannerRendererEnv> {
  fetch() { return new Response('Not found', { status: 404 }) }
  render(input: unknown) { return renderWithBinding(input, this.env, this.ctx) }
}
export default {
  fetch() { return new Response('Not found', { status: 404 }) }
}
