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
  insertion: z.enum(['append', 'before-last'])
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
  return { ...input, href: url.href }
}
