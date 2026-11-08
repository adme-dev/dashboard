import { createHash } from 'node:crypto'
import { canonicalMcpJson } from '~~/shared/utils/mcpRequestClaim'

/** JSON normalization also gives database Date values their ISO representation. */
export function storyboardHash(value: unknown): string {
  return createHash('sha256').update(canonicalMcpJson(JSON.parse(JSON.stringify(value)))).digest('hex')
}
