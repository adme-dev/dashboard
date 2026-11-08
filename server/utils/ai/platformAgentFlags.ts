import type { H3Event } from 'h3'

export type NativeAgentFlag = 'SPEND_CONTROLLER_AGENT_ENABLED' | 'PUBLISHING_PLANNER_AGENT_ENABLED' | 'FINANCIAL_WATCH_AGENT_ENABLED' | 'TRAFFIC_CONTROLLER_AGENT_ENABLED'
export function platformAgentEnabled(event: H3Event | undefined, flag: NativeAgentFlag): boolean {
  const bindings = (event?.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)?.cloudflare?.env
  const value = bindings && Object.prototype.hasOwnProperty.call(bindings, flag) ? bindings[flag] : process.env[flag]
  return value === true || value === 'true'
}
