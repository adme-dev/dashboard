import type { H3Event } from 'h3'
import { loadTenantVideoGenerationPolicy } from '~~/server/utils/video-generation/policy'
import { storyboardRequestDependencies } from './request'

export function storyboardProductionDependencies(event: H3Event) {
  const env = event.context.cloudflare?.env ?? process.env
  return {
    ...storyboardRequestDependencies(event),
    loadTenantPolicy: (tenantId: string) => loadTenantVideoGenerationPolicy(tenantId, env)
  }
}
