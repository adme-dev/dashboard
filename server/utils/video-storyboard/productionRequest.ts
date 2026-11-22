import type { H3Event } from 'h3'
import { storyboardRequestDependencies } from './request'

export function storyboardProductionDependencies(event: H3Event) {
  return storyboardRequestDependencies(event)
}
