# Cloudflare MCP Setup

This project exposes Cloudflare's managed remote MCP servers through the repo-local Cursor and VS Code MCP configs:

- `.cursor/mcp.json`
- `.vscode/mcp.json`

Configured servers:

| Server | URL | Use |
| --- | --- | --- |
| `cloudflare-api` | `https://mcp.cloudflare.com/mcp` | Search and execute Cloudflare API operations. |
| `cloudflare-docs` | `https://docs.mcp.cloudflare.com/mcp` | Fetch current Cloudflare documentation. |
| `cloudflare-observability` | `https://observability.mcp.cloudflare.com/mcp` | Inspect application logs and analytics. |
| `cloudflare-builds` | `https://builds.mcp.cloudflare.com/mcp` | Inspect and manage Workers Builds. |
| `cloudflare-audit-logs` | `https://auditlogs.mcp.cloudflare.com/mcp` | Query Cloudflare audit logs. |
| `cloudflare-graphql-analytics` | `https://graphql.mcp.cloudflare.com/mcp` | Query Cloudflare GraphQL analytics. |

Cloudflare's remote MCP servers use Streamable HTTP at `/mcp` and authorize via OAuth when an MCP client connects. Do not commit Cloudflare bearer tokens, cookies, OAuth grants, or API keys to this repository. For automation, create a scoped Cloudflare API token outside the repo and attach it through the MCP client secret/header mechanism.

Use product-specific servers first when possible. Keep `cloudflare-api` available for broader account operations, but prefer the docs, builds, observability, audit log, and GraphQL analytics servers for narrower permissions and clearer tool context.

Sources:

- Cloudflare managed MCP server catalog: `https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/`
- Cloudflare MCP authorization: `https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/`
- Cloudflare MCP transport: `https://developers.cloudflare.com/agents/model-context-protocol/protocol/transport/`
