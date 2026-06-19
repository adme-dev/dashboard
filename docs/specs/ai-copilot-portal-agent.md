# Spec: Client-Portal Co-pilot (Customer-Facing Agent)

**Status:** Design — implementation-ready
**Parent:** [PRD: Personal AI Co-pilot](../prd/personal-ai-copilot.md)
**Related:** [Phase 0 plan](./ai-copilot-phase-0-plan.md), [Memory architecture](./ai-copilot-memory-architecture.md)
**Created:** 2026-06-19
**Touches:** `server/api/portal/*`, `server/api/(agency/)client-portal/*`, `server/utils/clientAuth.ts`, `server/utils/ai/*`

---

## 1. What this is

A co-pilot **inside the client portal**, used by the **customer** (not agency staff) to *understand their portal* — "what's awaiting my approval?", "how did my social do last month?", "what's the status of my project?", "show me my new leads" — and, in a later tier, take their own low-risk actions (approve a proof, mark a lead contacted, update their own CRM record).

This is the **highest-stakes** surface in the whole co-pilot program: it lives **outside the agency trust boundary**. The entire design is therefore organized around one non-negotiable: **hard tenant isolation — a customer can only ever see and touch their own client's data.**

## 2. The architecture already anticipated this

Two facts make this a natural extension, not a new system:

1. **`ToolContext.clientScope`** exists and is documented as *"only set on client-scoped surfaces (e.g. the client portal); the agency staff chat does NOT set it."* It is the tenant key.
2. **There's already precedent for a clientScope-gated tool:** `knowledge.ts:80` —
   `if (m.clientScope && ctx.clientScope && m.clientScope !== ctx.clientScope) return false`.

Customer identity is solid: portal login resolves `client_users.client_id` (→ `agency_clients`), sessions in `client_sessions`, helper `server/utils/clientAuth.ts`. **`clientScope = session.clientId`** for every portal agent turn.

## 3. The isolation model (the part that must be right)

**A separate, portal-only tool registry — not the agency registry with a filter.** Agency tools (`get_finance_snapshot`, `get_client_profitability`, *other clients'* data) must be **physically unreachable** from the portal agent, not merely permission-filtered. Two registries:

```
server/utils/ai/tools/            # agency registry (staff) — unchanged
server/utils/ai/portalTools/      # NEW — portal registry (customers), clientScope-mandatory
  index.ts                        # only portal-safe tools
  toolContext: clientScope is REQUIRED here (type-enforced, not optional)
```

Defense in depth, all four layers:
1. **Separate registry** — the portal loop is constructed with `portalRegistry` only; agency tools never enter the toolset.
2. **`clientScope` required** — a portal `ToolContext` where `clientScope` is unset is a hard error, not a fallback. (Contrast agency, where it's optional.)
3. **Every tool filters by `clientScope`** — every query carries `WHERE client_id = $clientScope`. No tool trusts a model-supplied client id, ever.
4. **No cross-client tools exist in the registry** — portfolio/ranking/other-client tools are simply absent.

A mandatory test asserts that **no portal tool returns a row for a different `client_id`**, fuzzed across tools.

## 4. "Assigned apps" → the agent's capability set

The customer's portal shows a subset of surfaces (observed: `analytics, approvals, briefs, crm, gallery, invoices, leads, meetings, notifications, projects, requests, social-inbox, social-listening, social-reporting, video-reviews`). The user's intent — *"we can assign certain apps to the portal"* — maps directly to the agent's tool allowlist:

> **agent toolset = (apps enabled for THIS client) ∩ (portal-safe tools) ∩ (tier: read | read+own-actions)**

**Gap to formalize:** there is no single `portal_apps`/`enabled_modules` config table today (graph: 0 hits) — app visibility is currently implicit. To drive the agent cleanly, introduce a per-client **portal app-assignment** config (or read whatever the portal nav already uses) so "assign an app → the agent gains that app's tools" is one switch. This becomes the **portal equivalent of a skill-pack**, but assembled per-client by the agency, not per-role.

```
portal app enabled for client  →  portal tools unlocked
─────────────────────────────────────────────────────────
approvals      → get_my_approvals, (tier2) respond_to_approval
projects       → get_project_status_portal
invoices       → get_my_invoices
leads          → get_my_leads, (tier2) mark_lead_contacted
crm            → get_my_crm_records, (tier2) update_my_crm_record
social-reporting → get_my_social_report   (reuses socialReporting/portal.ts)
briefs/video-reviews → get_my_briefs, get_my_video_reviews
```

Note several already have **portal-scoped server utils** to wrap (`socialInbox/portal.ts`, `socialReporting/portal.ts`, `socialListening/portal.ts`) — the read tools are thin adapters over existing tenant-safe code.

## 5. Capability tiers (recommended sequencing)

- **Tier 1 — Understand (ship first).** Read-only. "Explain my portal", status, reports, what-needs-my-attention. Zero write risk. Delivers the stated need ("understand his portal").
- **Tier 2 — Act on own data (gated, later).** Only the low-risk actions the portal UI **already** lets the customer do, via the **same propose→confirm + audit** spine (Phase 0): `respond_to_approval` (the portal already has `approvals/[id]/respond`), `mark_lead_contacted` (`leads/[id]/contacted`), `update_my_crm_record` (portal CRM already supports create/patch). Each `mutates: true`, `clientScope`-bound, confirm-carded.
- **Never** at the portal: agency finance, other clients, staff-only operations, anything `requireRole`-gated for staff. The portal registry simply has no such tools.

## 6. CRM in the portal (explicit, since you flagged it)

The customer has portal CRM (`/portal/crm`, `client-portal/crm/*`). The agent's CRM reach is **their own CRM only**: `get_my_crm_records` (read), and tier-2 `update_my_crm_record` / `create_my_crm_record` — all `WHERE client_id = $clientScope`, reusing the existing portal CRM endpoints (which already enforce the tenant scope). The agent never sees the agency's cross-client CRM.

## 7. Memory & personalization

Reuse Phase-0 memory, **scoped to the portal user** (`scope='user'`, `user_id = client_user_id`, plus `clientId` in metadata). A customer's co-pilot can remember *their* preferences ("I approve proofs fastest on Fridays", "report me in monthly view") — never anything about the agency or other clients. Org-scope memory is **disabled** on the portal surface (no agency-shared facts leak to customers).

## 8. Module layout

```
server/utils/ai/portalTools/
  index.ts                 # portal registry (read tools tier 1; +own-action tools tier 2)
  portalContext.ts         # PortalToolContext: clientScope REQUIRED (distinct type)
  approvals.ts, leads.ts, crm.ts, invoices.ts, projects.ts, socialReport.ts, ...
server/utils/ai/portalLoop.ts            # or reuse toolLoop with a portal registry + required-scope guard
server/api/portal/ai/chat/...            # portal chat endpoints (mirror agency chat, clientAuth not requireAuth)
app/components/portal/PortalCopilot.vue  # the docked customer chat UI
```

Reuse: the tool-loop engine, propose/confirm (`ai_pending_actions` + `clientScope` column added), audit (`ai_action_audit`), memory, spotlighting. The portal loop differs only by **registry + required clientScope + clientAuth**.

## 9. Data changes

- `ai_pending_actions` / `ai_action_audit`: add a nullable `client_scope` column so portal proposals/audits are tenant-tagged (additive; agency rows leave it null).
- Portal app-assignment config (§4) — new small table or reuse existing portal-feature gating if present.
- Portal chat conversations: either reuse `ai_conversations` with a `client_user_id` + `client_id` (preferred — add nullable columns) or a parallel `portal_ai_conversations`. **Decision: extend `ai_conversations` with nullable portal columns** to keep one engine.

## 10. Risks (customer-facing — the bar is higher)

| Risk | Mitigation |
|---|---|
| **Cross-tenant data leak** (catastrophic) | Separate registry; `clientScope` REQUIRED (hard error if unset); every query `WHERE client_id=$scope`; fuzz test asserting no foreign `client_id` ever returned |
| Prompt injection from customer input → tries to reach agency data | Agency tools physically absent from registry; spotlight untrusted; model cannot call what isn't there |
| Customer executes something they shouldn't | Tier 1 read-only first; Tier 2 limited to actions the portal UI already permits, propose→confirm, audited |
| KB / memory bleed | KB search already `clientScope`-filtered (`knowledge.ts:80`); portal memory `user_id`+`clientId`-scoped; org-scope disabled on portal |
| "Assigned apps" implicit today | Formalize portal app-assignment config so the agent toolset is driven by one switch |
| Confused-deputy via internal endpoints | Portal tools call **portal** endpoints (`clientAuth`-gated), never agency endpoints |

## 11. Sequencing

1. **Phase 0** (memory + executor/audit) — shared prerequisite.
2. **Portal Tier 1** — separate portal registry, `clientScope`-required loop, read tools over existing portal/`*portal.ts` utils, docked `PortalCopilot.vue`. Cross-tenant fuzz test is the gate.
3. **Portal app-assignment config** — make the toolset agency-configurable per client.
4. **Portal Tier 2** — own-data actions via propose→confirm + audit, behind a flag, per action type.

## 12. Acceptance criteria

- [ ] A portal session yields `clientScope = client_id`; the portal agent **refuses to run** without it.
- [ ] Portal registry contains only portal-safe tools; no agency tool is reachable.
- [ ] Every portal tool returns only the caller's client's data; cross-tenant fuzz test passes.
- [ ] Tier 1 answers "what needs my approval / project status / my social report / my leads" within the client's scope.
- [ ] Agent toolset = enabled apps ∩ portal-safe tools (config-driven).
- [ ] Tier 2 actions (if enabled) reuse propose→confirm + `ai_action_audit`, `client_scope`-tagged.
- [ ] Memory is `client_user_id`-scoped; org-scope disabled; zero new type errors; `/code-review high` clean.

## 13. Product decisions (locked 2026-06-19 — recommended defaults; overridable)

1. **Tier 2 scope → DECIDED: ship read-only (Tier 1) first; first action added is `respond_to_approval`** (highest value, already an existing portal action). No other self-service writes until that's proven.
2. **App-assignment model → DECIDED: agency-managed per-client toggle set** (the agency assigns which apps/tools each client's portal agent gets), not a global default.
3. **Branding → DECIDED: single neutral "Portal Assistant" for v1**; per-client white-label (name/tone) is a fast-follow once Tier 1 ships.

---

### Sources
- [Human-in-the-Loop 2026 (Strata)](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/) · [Guardrails & Governance — CIO blueprint](https://www.cio.com/article/4094586/guardrails-and-governance-a-cios-blueprint-for-responsible-generative-and-agentic-ai.html) · [Governing the Agentic Enterprise (Berkeley CMR)](https://cmr.berkeley.edu/2026/03/governing-the-agentic-enterprise-a-new-operating-model-for-autonomous-ai-at-scale/)
