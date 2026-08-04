# Owner-Wide AI Release Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every active company owner automatic access to evaluation-approved pilot and active employee-assistant releases across all organizational departments without synthetic memberships or weakened governance.

**Architecture:** Keep the existing company-wide department scope and change only governed release admission. Revalidate active owner authority inside parameterized catalog SQL, preserve release-state and passing-evaluation predicates, then expose a client-safe `company_owner` basis through assistant explainability.

**Tech Stack:** Nuxt 4, Vue 3, Nitro/H3, TypeScript, Neon PostgreSQL, Nuxt UI v4, Vitest, happy-dom.

## Global Constraints

- Owner inheritance applies only to an authenticated, active, server-side role exactly equal to `owner`.
- `admin` and lower roles retain existing explicit pilot-membership behavior.
- `draft`, missing/failed evaluation, suspended, and retired releases remain non-executable.
- RBAC, access modes, personal disables, personas, confirmations, budgets, and audit logging continue to narrow access.
- Browser email, role, query, and body values never participate in owner authorization.
- Do not create department or `ai_release_pilot_members` records for owners.
- Do not change production flags, release states, deployments, or the Worker-size budget.
- Before modifying `app/pages/agency/ai/my-assistant.vue`, read and apply the mandatory project `frontend-design` skill. Preserve Nuxt UI v4 and do not redesign its settings form.
- Use Node 24 for every test and check.
- Fix adjacent defects only when a failing test or compiler diagnostic is in a touched path and the correction preserves this specification. Record unrelated systemic blockers without broadening the change.

---

## File Structure

- `server/utils/ai/governance/catalogComposition.ts`: authoritative owner and pilot release admission.
- `server/utils/ai/personalAssistantContext.ts`: active-pack access basis from revalidated identity.
- `server/utils/ai/assistantExplainability.ts`: client-safe authority mapping.
- `shared/types/aiAssistant.ts`: stable access-basis contract.
- `app/pages/agency/ai/my-assistant.vue`: owner-access explanation.
- `test/ai/catalogComposition.test.ts`: SQL-boundary and fail-closed tests.
- `test/ai/personalAssistantContext.test.ts`: identity and active-pack tests.
- `test/ai/assistantExplainability.test.ts`: client-safe mapping tests.
- `test/server/api/myAssistantExplainabilityEndpoint.test.ts`: endpoint contract.
- `test/app/aiAssistantExplainabilityUi.test.ts`: UI contract.
- `app/pages/features/[slug].vue` and `test/app/aiAssistantsMarketingPage.test.ts`: public feature sync.
- `docs/runbooks/ai-assistant-rollout.md`: operator rule.

---

### Task 1: Enforce Active-Owner Inheritance at the Catalog Boundary

**Files:**
- Modify: `server/utils/ai/governance/catalogComposition.ts`
- Test: `test/ai/catalogComposition.test.ts`

**Interfaces:**
- Consumes: `loadCatalogControlRows(departmentIds: string[], userId: string, db?: CatalogCompositionDb): Promise<ActiveCatalogRow[]>`.
- Produces: the same signature; pilot rows are admitted when a valid pilot membership exists or the database confirms `$2` is an active `owner`.
- Preserves: latest-version selection, evaluation predicates, control markers, and parameterized UUID inputs.

- [ ] **Step 1: Write the failing SQL-contract test**

Add to `describe('loadCatalogControlRows')`:

```ts
it('admits pilot releases for a database-confirmed active owner without weakening evaluation gates', async () => {
  const queryRows = vi.fn(async (sql: string) => sql.includes('ranked_pack_versions')
    ? [{ pack_id: PACK_ID, pack_version_id: PACK_VERSION_ID, version: 1 }]
    : [])

  await loadCatalogControlRows([DEPARTMENT_ID], USER_ID, { queryRows })

  const [sql, params] = queryRows.mock.calls[1]!
  expect(params).toEqual([[DEPARTMENT_ID], USER_ID])
  expect(sql).toContain("owner_actor.user_role = 'owner'")
  expect(sql).toContain('owner_actor.is_active = TRUE')
  expect(sql).toContain('owner_actor.id = $2')
  expect(sql).toContain('pilot_member.team_member_id = $2')
  expect(sql).toContain('evaluation_gate_passed = TRUE')
  expect(sql).toContain("evaluation_run_status = 'completed'")
})
```

Also assert both pack and capability CTEs use the owner predicate and neither admits `draft`.

- [ ] **Step 2: Run RED**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run test/ai/catalogComposition.test.ts
```

Expected: FAIL because the catalog query has no active-owner predicate.

- [ ] **Step 3: Implement one shared database-derived authority CTE**

Add before `active_pack_rows`:

```sql
WITH actor_authority AS (
  SELECT EXISTS (
    SELECT 1
      FROM team_members owner_actor
     WHERE owner_actor.id = $2
       AND owner_actor.is_active = TRUE
       AND owner_actor.user_role = 'owner'
  ) AS is_active_owner
),
active_pack_rows AS (
```

For both release kinds, retain the existing membership query and insert this exact branch between the existing non-pilot check and existing `EXISTS` branch:

```sql
OR (SELECT is_active_owner FROM actor_authority)
```

The resulting parenthesized predicate must remain `non-pilot OR active-owner OR existing-valid-pilot-membership`. Use the actual `pack_release` and `capability_release` aliases. Do not change the existing membership subquery, state filters, or evaluation filters.

- [ ] **Step 4: Run GREEN and adjacent catalog tests**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run \
  test/ai/catalogComposition.test.ts \
  test/ai/catalogRuntimePolicy.test.ts \
  test/ai/pilotRuntimeBinding.test.ts
```

Expected: PASS.

- [ ] **Step 5: Review the full SQL and commit**

Confirm these remain present for both release kinds:

```text
release_state IN ('pilot', 'active', 'suspended', 'retired')
evaluation_gate_passed = TRUE
evaluation_run_status = 'completed'
pilot_member.revoked_at IS NULL
pilot_actor.is_active = TRUE
```

Run `git diff --check`, inspect the full function, then commit:

```bash
git add server/utils/ai/governance/catalogComposition.ts test/ai/catalogComposition.test.ts
git commit -m "feat(ai): inherit governed releases for owners"
```

---

### Task 2: Explain Owner Inheritance in the Personal Assistant

**Files:**
- Modify: `server/utils/ai/personalAssistantContext.ts`
- Modify: `server/utils/ai/assistantExplainability.ts`
- Modify: `shared/types/aiAssistant.ts`
- Modify: `app/pages/agency/ai/my-assistant.vue`
- Test: `test/ai/personalAssistantContext.test.ts`
- Test: `test/ai/assistantExplainability.test.ts`
- Test: `test/server/api/myAssistantExplainabilityEndpoint.test.ts`
- Test: `test/app/aiAssistantExplainabilityUi.test.ts`

**Interfaces:**
- Produces: `export type AssistantReleaseAccessBasis = 'company_owner' | 'catalog_policy'`.
- Produces: `accessBasis: AssistantReleaseAccessBasis` on internal and client active-pack entries.
- Consumes: the database-revalidated identity from `resolvePersonalAssistantContext()`.

- [ ] **Step 1: Invoke the mandatory frontend-design skill**

Read `~/.Codex/plugins/marketplaces/Codex-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md`. Limit UI work to the active-pack authority explanation; preserve the settings form.

- [ ] **Step 2: Write failing context, API, and UI tests**

For a database identity with `role: 'owner'`, assert:

```ts
expect(context.activePacks[0]?.accessBasis).toBe('company_owner')
expect(catalogCall?.[1]).toEqual([[CREATIVE_ID, PRODUCTION_ID], USER_ID])
```

Add a non-owner control expecting `catalog_policy`. Require `accessBasis: 'company_owner'` in explainability and endpoint responses, and visible UI copy `Company owner access`.

- [ ] **Step 3: Run RED**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run \
  test/ai/personalAssistantContext.test.ts \
  test/ai/assistantExplainability.test.ts \
  test/server/api/myAssistantExplainabilityEndpoint.test.ts \
  test/app/aiAssistantExplainabilityUi.test.ts
```

Expected: FAIL because the field and copy do not exist.

- [ ] **Step 4: Add the shared type and populate it from server identity**

In `shared/types/aiAssistant.ts`:

```ts
export type AssistantReleaseAccessBasis = 'company_owner' | 'catalog_policy'
```

Add `accessBasis` to `MyAssistantActivePackView` and the internal active-pack type. Populate it only after identity admission:

```ts
accessBasis: identity.role === 'owner' ? 'company_owner' : 'catalog_policy'
```

- [ ] **Step 5: Map and render the client-safe explanation**

Map `accessBasis` in `buildMyAssistantExplainability()`. In `my-assistant.vue`, import the type and add:

```ts
const releaseAccessLabel = (basis: AssistantReleaseAccessBasis) => basis === 'company_owner'
  ? 'Company owner access'
  : 'Governed catalog access'
```

Render it as secondary text in each active-pack row. Do not expose IDs, raw catalog rows, instructions, or emails.

- [ ] **Step 6: Run GREEN, scoped typecheck, and commit**

Run the Step 3 tests, then:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm run typecheck 2>&1 \
  | awk '/^(server\/utils\/ai\/(personalAssistantContext|assistantExplainability)\.ts|shared\/types\/aiAssistant\.ts|app\/pages\/agency\/ai\/my-assistant\.vue)/ { print; found=1 } END { exit found ? 1 : 0 }'
git diff --check
```

Expected: focused tests pass and changed paths emit no diagnostics. Commit:

```bash
git add server/utils/ai/personalAssistantContext.ts server/utils/ai/assistantExplainability.ts \
  shared/types/aiAssistant.ts app/pages/agency/ai/my-assistant.vue \
  test/ai/personalAssistantContext.test.ts test/ai/assistantExplainability.test.ts \
  test/server/api/myAssistantExplainabilityEndpoint.test.ts test/app/aiAssistantExplainabilityUi.test.ts
git commit -m "feat(ai): explain company owner access"
```

---

### Task 3: Synchronize Documentation and Battle-Test the Policy

**Files:**
- Modify: `app/pages/features/[slug].vue`
- Modify: `docs/runbooks/ai-assistant-rollout.md`
- Test: `test/app/aiAssistantsMarketingPage.test.ts`

**Interfaces:**
- Consumes: the runtime and explainability behavior from Tasks 1–2.
- Produces: public and operator copy stating that owners inherit approved releases without bypassing governance.

- [ ] **Step 1: Write the failing marketing contract**

Require the AI assistants feature source to include:

```ts
expect(source).toContain('company owners')
expect(source).toContain('evaluation-approved')
```

- [ ] **Step 2: Run RED**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run test/app/aiAssistantsMarketingPage.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Update public and operator copy**

Add this meaning to the existing AI assistants feature entry and rollout runbook:

```text
Active company owners inherit every evaluation-approved pilot and active employee-assistant release across organisational departments, while draft, failed, suspended and retired releases remain blocked.
```

The runbook must also state that owner inheritance creates no synthetic membership and does not activate runtime flags.

- [ ] **Step 4: Run the relevant regression**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run \
  test/ai/catalogComposition.test.ts test/ai/catalogRuntimePolicy.test.ts \
  test/ai/pilotRuntimeBinding.test.ts test/ai/personalAssistantContext.test.ts \
  test/ai/assistantExplainability.test.ts test/server/api/myAssistantExplainabilityEndpoint.test.ts \
  test/app/aiAssistantExplainabilityUi.test.ts test/app/aiAssistantsMarketingPage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full AI and production build gates**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run test/ai
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm run build
```

Expected AI result: PASS. Compilation and prerender must succeed. The Worker-size check must pass before calling the branch deployable; its recorded parent-plan overage must not be hidden by raising the budget.

- [ ] **Step 6: Perform the pre-commit deep review**

Re-read every modified file and verify:

```text
owner role is database-derived and active
admin does not inherit pilot releases
draft, failed, suspended, and retired releases are not executable
evaluation predicates remain mandatory
no raw IDs or prompt material reach explainability
Nuxt UI v4 conventions remain intact
no server/frontend alias mismatch exists
git diff --check is clean
```

Fix any scoped defect test-first and rerun the smallest failing test before the complete regression.

- [ ] **Step 7: Commit documentation**

```bash
git add app/pages/features/[slug].vue docs/runbooks/ai-assistant-rollout.md \
  test/app/aiAssistantsMarketingPage.test.ts
git commit -m "docs(ai): document owner release inheritance"
```

---

## Completion Gate

- Both release CTEs revalidate active owner authority.
- Owner inheritance and explicit pilot membership have passing tests.
- Evaluation and release-state predicates remain mandatory.
- Explainability displays `Company owner access` without internal identifiers.
- Public and operator documentation are synchronized.
- Focused, relevant, and full `test/ai` suites pass on Node 24.
- Changed-path type diagnostics and `git diff --check` are clean.
- Independent reviews have no unresolved Critical or Important findings.
- No deployment, release transition, production flag change, or synthetic membership occurs.
