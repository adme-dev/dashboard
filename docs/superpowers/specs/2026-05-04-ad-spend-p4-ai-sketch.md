# P4 — In-App AI Chat as MCP Client (Sketch — revised)

**Status:** Exploratory — not committed
**Roadmap:** [Ad Spend Roadmap](2026-05-04-ad-spend-roadmap.md)
**Date:** 2026-05-04 (revised)
**Supersedes:** Original 2026-05-04 sketch (Groq narrative + per-row explain + reallocation suggestions). Architecture changed; use cases retained.

## What changed

The original sketch assumed we'd build narrative cards, anomaly explanations, and reallocation suggestions on top of our `media_spend` data using Groq. Two events made that the wrong architecture:

1. **Meta launched their Ads MCP** (April 29, 2026) — `mcp.facebook.com/ads` exposes Meta campaign data + writes via MCP, no developer credentials required
2. **Perplexity / Claude Desktop / ChatGPT** all converged on standard remote-MCP-with-OAuth UX — paste URL, OAuth, done

The right architecture: **our in-app AI chat becomes an MCP client** that calls Meta's MCP (and other platforms' MCPs as they ship) plus our own MCP server ([P6](2026-05-04-xeroflow-mcp-server-sketch.md)). The narrative card and reallocation suggestions are use cases of that architecture, not bespoke endpoints.

## Vision

The existing AI chat sidebar in the dashboard becomes a multi-source AI agent. When the user asks "show me Brighton Auto's Meta CTR this week", the agent calls Meta's MCP. When they ask "what's our agency-wide MTD margin?", it calls our own MCP (P6) for cross-platform spend + Xero data. The user never leaves the dashboard, and we don't reimplement what Meta has already built.

## Likely shape

### Architecture
- Reuses existing `useAiChat` composable + chat sidebar
- Backend: Anthropic SDK (TS) with MCP client support — invoked from a streaming endpoint
- Connects to: Meta's MCP server (`mcp.facebook.com/ads`), our own MCP server (P6), other platform MCPs as they ship (Google likely next)
- Groq stays in the stack for fast non-tool-using inference (e.g. cached daily narrative)

### Auth
- Meta MCP: reuses existing Meta OAuth tokens from `social_connections` (extend scopes if MCP requires beyond `ads_read,ads_management`)
- Our MCP (P6): reuses existing XeroFlow `user_sessions`
- No second auth dance for users — they already OAuth'd Meta and logged in to XeroFlow

### In-page surfaces (use cases on the spend page)
- **Daily AI narrative card** at top of `/agency/social/spend` — once-per-day Anthropic call with MCP context, summary of pacing/anomalies/connections in 2–3 sentences, cached in KV for 6h
- **Per-row "explain" tooltip** on flagged rows — hover triggers debounced agent call (single tool sequence: `get_client_pacing` + `get_campaign_insights` from Meta MCP if applicable)
- **Reallocation suggestions** below the table — "Move $X from Acme to Beta because Acme is at 142% with 12 days left and Beta is at 41%"

### Conversational sidebar
- Persona pinned to "agency operations analyst"
- Context pre-loaded with current page's spend summary + connection health
- Multi-tool: agent decides whether to call Meta MCP, our MCP, or answer from context
- Tool-call observability: each MCP call shown as a small pill in the chat ("called `get_client_pacing(brighton-auto)`") so users can see the agent's reasoning

## Open questions

- **Token cost vs. utility** — daily narrative is cheap; conversational sidebar with multi-step tool calls is more expensive. Need real-traffic measurement before scaling.
- **Tool-call observability UX** — when the AI calls Meta's MCP, what does the user see? Loading spinner? Tool-name pill? Important for trust and debuggability.
- **Failure modes** — Meta MCP down → degrade to last cached spend data + warning. Our MCP down → degrade to direct DB queries. Anthropic SDK down → no chat. Need clear UX for each.
- **Cross-MCP reasoning** — can the agent correctly compose "Meta CTR via Meta MCP" + "client mapping via our MCP" + "Xero bank-charges via our MCP" into one answer? Likely needs explicit tool-orchestration prompts; worth real testing.
- **Streaming UI** — chat needs token-streaming for responsiveness. Existing `useAiChat` may or may not handle MCP-tool-call interleaving — needs review.

## Dependencies

- **P6 (XeroFlow MCP server) — strongly preferred prerequisite**. Without our own MCP, the agent can only answer Meta-specific questions; cross-platform synthesis (our differentiator) requires our MCP. Building P4 before P6 means redundant tool-calling layers.
- **P2 (pacing)** — provides the structured data agent reasons over for the narrative card and reallocation suggestions. Could ship without P2 but the answers would be thinner.
- **P3 (alerts)** — anomaly explanations consume P3's alert events as input.

## Out of scope

- Building our own AI model
- Fine-tuning anything (defer until ≥3 months of corrected/validated narratives exist)
- Custom MCP server (that's [P6](2026-05-04-xeroflow-mcp-server-sketch.md))
- Replacing the dashboard UI with a chat-only experience

## Decision point

After P6 ships, the cost of P4 drops significantly — most of the data-access layer is already built as MCP tools and the team has experience operating it. Re-evaluate then whether the in-dashboard conversational UI is the right next investment, or whether agency staff using XeroFlow's MCP via Claude Desktop / Perplexity already covers 80% of the value (in which case P4 is just the narrative card + per-row explain, not the full sidebar).
