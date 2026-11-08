# Personal assistants, native chat and marketing tools

Source: base `fa14776da587cf9bac3ffdc77aa3fffa0f442715` plus the personal-assistant integration change. Release commit and deployment evidence belong in the accompanying release report. Reviewed 7 November 2026.

## Employee entry points

Employees open **AI Chat** and **My Assistant** from Tools. My Assistant holds their own saved focus, disabled tools and memory preference. It does not create another model or grant access. Every native turn resolves the active identity, current explicit database grants for the exact assigned system or custom role, department memberships, client scope, personal narrowing and applicable evaluated release. These admission reads use the uncached database path. A role reassignment during admission fails closed for retry; static role defaults cannot restore revoked grants. My Assistant discovery also keeps Finance tools behind the explicit Finance grant, including for owners. No saved settings means the documented defaults apply.

Chat starts with My Assistant inheritance. An explicit focus, including General, overrides the personal default for that conversation. Selecting My Assistant sends JSON null, clears the owning conversation's stored focus and inherits the saved personal default. Omitted focus preserves an existing conversation override for legacy callers. Both text and voice preserve these distinctions. Conversation persistence is bound to the authenticated owner.

Role, intent and focus narrow permitted tools; they cannot grant Finance or other access. ADMIN, MANAGEMENT and MARKETING_MANAGEMENT share all-active **client scope**; this does not grant company accounting. Finance requires its own fresh explicit grant. Other staff retain assigned-client scope.

## Native marketing and external MCP

Native chat and the remote MCP endpoint reuse the reviewed department schemas, handlers and domain coordinators. Native authority is privately branded after authenticating the actual chat actor and loading fresh staff authority. No OAuth scopes are invented and chat does not call its own remote MCP endpoint. External MCP still checks the connecting user's real OAuth grant.

Native discovery and execution recheck the server gate, active staff, explicit permission groups, current operator grants and client scope. Effective composition also applies persona, personal disabled tools, read-only status and governed-release ceilings. The default Marketing and Media Buyer focuses recognize the reviewed department catalogue.

A model call to a mutating department tool only creates a pending action. The confirmation card shows the operation and exact arguments. Higher-risk actions require an additional acknowledgement. The existing authenticated confirmation endpoint atomically claims the actor/conversation-bound action; a registered bounded executor rechecks fresh authority, current catalogue policy and original schema. Existing independent review, operation flags, provider authority and domain idempotency still apply. A confirmation click is not approval by an independent reviewer.

Native operation keys bind actor, persisted message, operation and arguments. Runtime/audit provenance says chat. Some shared domain ledgers retain their existing `mcp` storage discriminator; it is a compatibility namespace, not evidence of external OAuth authority. Expiry, replays and uncertain dispatch outcomes must not create another provider write. Returned evidence must distinguish preparation, review, queue acceptance, execution and reconciliation.

## Models, context and memory

The existing main chat model route uses Groq (GPT OSS 120B with the configured fallback). Cloudflare Think powers separate durable specialist agents; installing an employee connector does not automatically invoke every specialist. This repair does not replace the model route or upgrade the Agents SDK.

Recent conversation history, retrieved agency context and long-term personal/shared memory are different inputs. Personal memory remains actor-scoped; shared memory follows its own department/organization rules. My Assistant's memory preference narrows use. Observe-and-learn and memory distillation have separate runtime flags. An external host's private history or memory is not imported automatically.

`resolveChatRuntime` resolves the private tool flag from request Cloudflare binding, private Nuxt runtime configuration, then process environment; invalid values fail closed. The chat engine, My Assistant metadata and Model Ops diagnostics use this same resolver. Public build-time configuration alone is not runtime proof.

## Governance and rollout limits

Workflow discovery first applies fresh explicit role grants, published role attachments, focus, personal disabled tools and read-only limits. It then reuses any existing server-issued, actor-bound owner runtime authority only for catalogue release admission, while the fresh actor is still an owner. No workflow mints authority or bypasses downstream specialist policy. Native integration does not turn draft packs into evaluated releases. Pilot and enforcement readiness remain separate gates. The 7 November baseline had 20 active employees, zero covered and 30 blockers; no completed employee rollout was established. See [rollout runbook](../runbooks/ai-assistant-rollout.md) for exact evaluation, ownership, pilot and independent privacy/security approval requirements. No approval, evaluated result or employee-session acceptance may be inferred from an owner test.

This change adds no access to employees' Cloudflare accounts, GitHub repositories or external documents. The source research below informed the implementation; connecting those services requires a separate explicit scope.

## Official Cloudflare research

- [Agents source](https://github.com/cloudflare/agents): current framework source and examples.
- [Think](https://developers.cloudflare.com/agents/harnesses/think/) and [lifecycle hooks](https://developers.cloudflare.com/agents/harnesses/think/lifecycle-hooks/): durable agent harness and per-turn assembly.
- [Tools](https://developers.cloudflare.com/agents/harnesses/think/tools/): tool selection is distinct from authority.
- [Routing authentication](https://developers.cloudflare.com/agents/runtime/routing/authentication/): authenticate and authorize the target instance before routing.
- [MCP client API](https://developers.cloudflare.com/agents/model-context-protocol/apis/client-api/): discovery filtering does not replace tool authorization.
- [Conversation state and memory](https://developers.cloudflare.com/agents/concepts/conversation-state-and-memory/): distinguish history, prompt context and memory.

The existing generated graph predates current path IDs and has collisions. It was not regenerated in this change and is stale for this integration. Current source, this architecture note and release receipts take precedence over old diagrams.

## Role skills and official references

Role Skills & Sources at `/agency/ai/skills` adds a role-filtered composer menu and versioned original request guidance. The selected `{key,versionId}` is admitted again on text and voice submission and at engine execution. Skill guidance is bounded task data, not tool authority, and actual user text/transcription remains the persisted input. An immutable version change or revoked role binding requires selection again.

Fresh ADMIN grants govern draft editing and explicit publication; bindings never grant permissions or activate capability packs. Ordinary tool, client, personal-disable, read-only, runtime and evaluated-release ceilings remain enforced. Enabled native specialist adapters reuse authenticated scoped agent routes in read-only mode, require current client authority and never enter Spend Controller proposal mode. The shared specialist authority now uses current explicit role grants and Marketing management all-active client scope.

Official documentation lookup uses exact approved HTTPS host/path families, public-network checks on every redirect, a shared timeout and byte limits. Authenticated staff, including read-only roles, can read approved source previews through `GET /api/agency/ai/documentation/read` without mutation permission. It records unavailable/error/login/script-only sources rather than inventing verification. Repository references are pinned; independently written XeroFlow workflows do not import remote scripts or proprietary plugin bodies. See [the source register](role-skills-source-register.md) for exact revisions and licensing evidence.
