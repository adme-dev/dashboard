import { createError } from 'h3'
import { z } from 'zod'

const selector = z.string().trim().min(1).max(200).refine(value => (
  !/[,:(){}\\]/.test(value)
  && /^[a-zA-Z0-9_#.\-[\]="' >+~]+$/.test(value)
), 'Use a bounded ID, class, element or attribute selector')

export const menuAgentConfigInput = z.object({
  enabled: z.boolean(),
  label: z.string().trim().min(1).max(60).refine(value => !/[<>]/.test(value), 'Label must be plain text'),
  href: z.string().trim().url().max(2048),
  desktopSelector: selector,
  mobileSelector: selector,
  insertion: z.enum(['append', 'before-last']),
  /** Front-page feature block: bounded cards for the newest published guides. */
  featureEnabled: z.boolean().default(false),
  featureSelector: z.union([z.literal(''), selector]).default(''),
  featurePosition: z.enum(['prepend', 'append', 'before', 'after']).default('append'),
  featureMaxItems: z.number().int().min(1).max(3).default(3),
  featureHeading: z.string().trim().min(1).max(80).refine(value => !/[<>]/.test(value), 'Heading must be plain text').default('Latest buying guides')
})

export type MenuAgentConfigInput = z.infer<typeof menuAgentConfigInput>

export function normalizeMenuAgentConfig(
  input: MenuAgentConfigInput,
  contentHostname: string
): MenuAgentConfigInput {
  const url = new URL(input.href)
  if (url.protocol !== 'https:'
    || url.hostname.toLowerCase() !== contentHostname.toLowerCase()
    || url.username
    || url.password
    || url.port
    || url.search
    || url.hash
    || (url.pathname !== '/' && !/^\/guides\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(url.pathname))) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Menu links must use the configured content hostname and an approved guide path'
    })
  }
  if (input.featureEnabled && !input.featureSelector) {
    throw createError({ statusCode: 400, statusMessage: 'A feature block selector is required when the block is enabled' })
  }
  return { ...input, href: url.href }
}

export interface MenuAgentFeatureItem {
  title: string
  excerpt: string
  href: string
  publishedAt: string
}

/** Public payload shape served to the GTM agent. */
export interface MenuAgentPublicConfig {
  enabled: boolean
  label: string
  href: string
  desktopSelector: string
  mobileSelector: string
  insertion: 'append' | 'before-last'
  feature: {
    enabled: boolean
    selector: string
    position: 'prepend' | 'append' | 'before' | 'after'
    heading: string
    items: MenuAgentFeatureItem[]
  }
}
