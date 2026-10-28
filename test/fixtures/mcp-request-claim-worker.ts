import type { McpPageStudioLoginProof } from '../../shared/utils/mcpPageStudioLogin'
import {
  MCP_REQUEST_AUDIENCE,
  digestMcpRequestBody,
  signMcpRequestClaim
} from '../../shared/utils/mcpRequestClaim'

interface Env {
  SIGNING_SECRET: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as {
      userId: string
      tool: string
      args: unknown
      idempotencyKey: string
      pageStudioLogin?: McpPageStudioLoginProof
    }
    const assertion = await signMcpRequestClaim({
      uid: body.userId,
      ...(body.pageStudioLogin ? { pageStudioLogin: body.pageStudioLogin } : {}),
      scope: ['mcp:read', 'mcp:write'],
      godMode: true,
      audience: MCP_REQUEST_AUDIENCE,
      method: 'POST',
      path: '/api/internal/mcp/call',
      toolName: body.tool,
      bodyDigest: await digestMcpRequestBody(body)
    }, env.SIGNING_SECRET)

    return Response.json({ assertion })
  }
}
