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
    }
    const assertion = await signMcpRequestClaim({
      uid: body.userId,
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
