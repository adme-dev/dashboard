# PRD — Internal Sub-Ledger & Bookkeeping Platform

| | |
|---|---|
| **Product** | XeroFlow Internal Ledger |
| **Owner** | Paul |
| **Status** | Draft v0.2 — Discovery (post-audit) |
| **Date** | 2026-05-04 |
| **Strategic context** | Evolves the dashboard from a Xero *consumer* into a Xero *peer / replacement* for internal use, with a runtime-flippable toggle so Xero can be turned off and back on at will. Future productisation possible but explicitly out of scope here. |

---

## 1. Executive summary

We are extending the dashboard with a **double-entry accounting sub-ledger** that becomes the operational source of truth for the agency's financial data. It runs **alongside Xero** initially (Xero remains the book of record), then progressively takes over.

The non-negotiable architectural requirement is a **bidirectional toggle**: the agency must be able to switch off Xero and run on the internal ledger, then flip back to Xero at any time. This is achieved via a **`FinanceDataProvider` abstraction** with a 5-state mode flag (`xero` → `dual_write` → `internal_dual_read` → `internal`, with reversible flip-back at every step).

This is a **bookkeeping platform**, not an accounting / tax-filing / payroll platform. In-house and external accountants stay in the loop — they sign off and lodge BAS/STP via their tax-agent portal, using BAS-prep exports from our system.

The primary value is **not** the ~$1k/yr Xero subscription. It is:

1. One source of truth for AI, forecasting, dashboards, reconciliation
2. EOM invoicing native to the ledger (no Xero round-trip / rate limits)
3. Foundation for an eventual SaaS product for agencies (year 2+)

---

## 2. Problem statement

A code audit on 2026-05-04 (see Appendix C) confirmed the depth of Xero coupling:

1. **11 read flows, 3 write flows** — the platform reads Xero as authoritative (P&L, BS, aging, customer rollups, cashflow forecast all render from Xero API). The hard part isn't pushing to Xero; it's that we depend on Xero for truth.
2. **The Get-Out CFO dashboard is 45 endpoints**, all Xero-dependent. Single biggest coupling.
3. **No abstraction layer.** `xeroFetch()` is called raw across server code — there is no service interface that could swap implementations today.
4. **Zero Xero tests** in the codebase. Any toggle work is high-risk without first establishing a test harness.
5. **AI features** (anomaly detection, forecasting, recommendations) read Xero API output rather than raw GL — limits granularity and adds latency.
6. **EOM invoicing** is bottlenecked by Xero rate limits and contact-matching logic.
7. **Two systems disagree** on numbers in subtle ways; staff don't always know which to trust.
8. **Implicit toggle plumbing already exists** but isn't a deliberate switch — middleware redirects to `/settings` when disconnected, dashboard has a "Demo Mode". Pieces, no whole.

---

## 3. Goals & non-goals

### Goals
- **G1** — Own the operational ledger. Xero becomes a sync target, not a source.
- **G2** — Bookkeeper-grade reconciliation UI with live AU bank feeds.
- **G3** — Reports (P&L, BS, GL, TB, aged AR/AP, BAS prep) match Xero outputs to the cent during dual-write phase.
- **G4** — Audit trail and period-lock rigorous enough that an accountant signs off without complaint.
- **G5** — **Bidirectional, agency-wide toggle** — `FINANCE_PROVIDER` mode flag with safe-to-flip transitions in either direction.
- **G6** — Foundation for full Xero replacement and (later) productisation.

### Non-goals (this PRD)
- BAS/GST lodgement automation (accountants lodge via tax-agent portal)
- Payroll, STP reporting, TPAR, super
- Multi-currency
- Multi-entity / per-client toggle (defer to productisation; agency-wide single toggle in v1)
- Public productisation / multi-tenant SaaS
- Direct payment initiation (NPP, PayTo, real-time bank transfers)
- SOC 2 / ISO 27001 certification
- Activating the existing `client_xero_connections` per-client OAuth scaffold (different problem; distracts from core ledger)

---

## 4. Users & personas

| Persona | Needs | Frequency |
|---|---|---|
| Agency staff (AMs, media buyers, producers) | Create invoices, view client P&L, code expenses to projects | Daily |
| Internal finance / external bookkeeper | Reconcile bank feeds, post journals, BAS prep, period close | Daily/weekly |
| Owner / Finance lead | Cashflow, anomaly oversight, period close approval, **toggle the mode flag** | Weekly/monthly |
| Accountants (tax agent) | Year-end reports, GL drill-down, BAS-prep export, sign-off | Quarterly/annually |
| AI agents | Read raw GL for forecasting, anomaly detection, recommendations | Continuous |

---

## 5. Strategic phasing

Revised post-audit. The original Phase 1 (1–4 months) was too tight given 45 Get-Out endpoints, no tests, and no abstraction layer. Honest sizing below.

| Phase | Months | Outcome | Exit criteria |
|---|---|---|---|
| **0. Provider abstraction + tests** | 1 | All Xero calls behind `FinanceDataProvider` interface; first Xero test harness | All Xero call sites refactored; ≥80% test coverage of provider; behaviour unchanged |
| **1. Internal ledger + dual-write** | 3–4 | Ledger engine, COA, dual-write of invoices/bills/payments/journals to both Xero and internal | TB matches Xero TB ±$0.01 daily, 30 consecutive days |
| **2. Bank feeds + reconciliation** | 3 | Basiq integration, reconciliation UI, rules engine | Bookkeeper does ≥80% of weekly recon work in our platform |
| **3. Internal reads (reports + rollups)** | 3 | P&L, BS, aging, rollups read from internal; mode `internal_dual_read` available | Accountant signs off a full quarter using only our reports |
| **4. Toggle to `internal` for one entity** | 1 | First go-live with Xero off; flip-back drill validated | One full FY native, flip-back drill executed twice without data loss |
| **5. Productisation** | Year 2+ | Multi-tenant SaaS, per-client toggling | Separate PRD |

**Total: ~12 months to first entity running native** — same end-date as the v0.1 PRD, but a more honest path.

---

## 6. Functional requirements

### 6.0 Provider abstraction (Phase 0 — net-new)

Single most important architectural piece. Built **before** any ledger work.

- A `FinanceDataProvider` interface in `server/utils/finance/provider.ts` with methods covering every current Xero touchpoint:
  - Reads: `getInvoices`, `getContacts`, `getPnL`, `getBalanceSheet`, `getAging`, `getBankBalances`, `getCashflowForecast`, `getRepeatingInvoices`, `getBudgetVariance`, `getCustomerRollups`
  - Writes: `createInvoice`, `createQuote`, `convertQuoteToInvoice`
- Two implementations:
  - `XeroProvider` — wraps current `xeroFetch()` calls (current behaviour, no functional change)
  - `InternalProvider` — stub initially; built out across Phases 1–3
- Single config: `FINANCE_PROVIDER` env var with values per §6.9
- Provider returned by `useFinanceProvider(event)` factory
- All 45 Get-Out endpoints refactored to consume the provider, not raw Xero calls
- First Xero test harness — mock provider for unit tests

### 6.1 General ledger (Phase 1)
- Configurable chart of accounts — hierarchical, account types: asset / liability / equity / income / expense
- Tax codes per account, override per line
- Double-entry journal engine — every posting validated, balanced, immutable once posted
- Journal sources: invoice, bill, payment, manual, recurring template, system (depreciation, accruals, FX)
- Posting period derived from transaction date; rejected if period locked
- Dimensions: client, project, campaign, cost-centre (existing rate-card / project structure)

### 6.2 Bank feeds & reconciliation (Phase 2)
- **Basiq integration** — hosted CDR consent flow, webhook receiver, transaction sync
- Manual CSV import fallback (every AU bank supports export)
- Reconciliation queue UI — list view, match-by-amount, match-by-description, split, transfer
- **Rules engine** — `if description matches X → suggest account Y`; auto-post above N% confidence
- Bulk operations (code 50 transactions in one click)
- Bank statement balance vs ledger balance reconciliation report
- Missing-transaction detector (gaps in date ranges)

### 6.3 Accounts receivable
- Builds on existing invoice + EOM engine
- Payment application: full / partial / over-payment / credit notes
- Aged receivables report
- Customer statements (already partial — extend)
- Auto-reminders (existing)

### 6.4 Accounts payable
- Bill capture: manual entry, **email-to-bill** via existing email worker, **OCR via Workers AI**
- Approval workflow (reuse existing approval patterns)
- Payment runs — batch payments, **ABA file export** for AU bank upload
- Supplier statements

### 6.5 Tax (GST / BAS prep)
- Per-line tax code: GST, GST-free, input-taxed, export, capital purchases
- BAS prep report — G1, G2, G3, G10, G11, 1A, 1B fields
- Tax reconciliation — GST collected vs paid
- **Lodgement is out** — accountant lodges via tax-agent portal using our export

### 6.6 Reporting (Phase 3)
- P&L (period, comparative, by client/project/campaign)
- Balance sheet
- Cashflow statement
- Trial balance
- General ledger with drill-down to source transaction
- Aged AR / aged AP
- Custom report builder (Phase 3+)
- All reports exportable to PDF + CSV + Xero-format

### 6.7 Period management
- Period lock — typically monthly or quarterly
- Year-end close — auto rollover P&L into retained earnings
- Re-open period requires owner approval + reason logged
- All locks reversible with full audit trail

### 6.8 Audit trail
- Every journal posting / edit / void / reversal logged with user, timestamp, before/after, reason
- 7-year retention minimum
- Immutability post-period-lock — edits become reversal+repost, never in-place updates
- Audit log viewer accessible to accountants
- DB-level trigger enforcement (not just app-layer)

### 6.9 Bidirectional toggle (5-state mode flag)

Single agency-wide config: `FINANCE_PROVIDER`. Five states with reversible transitions in either direction.

| State | Writes | Reads | Use case |
|---|---|---|---|
| **`xero`** | Xero only | Xero only | Today's behaviour — Phase 0 entry state |
| **`dual_write`** | Xero + internal | Xero | Validating internal ledger silently — Phase 1 default |
| **`internal_dual_read`** | Xero + internal | Internal (Xero kept warm as fallback for reconciliation alerts) | Bookkeeper switches over — Phase 3 default |
| **`internal`** | Internal only | Internal only | Xero subscription cancelled — Phase 4 |
| **`xero` (flip-back)** | Re-enable Xero, replay missing journals from internal → Xero, return to `xero` mode | | Safety valve at any point |

**Flip-back guarantee:** while in `dual_write` or `internal_dual_read`, Xero is kept current — flipping back is a config change. While in `internal`, flipping back requires running a replay script (`scripts/replay-internal-to-xero.ts` — Phase 4 deliverable) before the mode switch.

**Why agency-wide, not per-entity:** the audit confirmed `xero_org_connection` is single-tenant. Per-entity dual-mode triples complexity for zero current benefit. Defer to productisation.

### 6.10 AI integration
- AI agents read GL directly via `FinanceDataProvider` (improves forecasting + anomaly accuracy)
- Anomaly detection migrates from Xero-API-derived to GL-derived (faster, more granular)
- Bill OCR via Workers AI on inbound supplier emails
- Reconciliation rule suggestions ("you've coded 3 AWS charges to Cloud Hosting — create a rule?")
- Natural-language reporting via Groq ("show me Q3 cogs vs last year by client")

---

## 7. Non-functional requirements

| Category | Requirement |
|---|---|
| **Accuracy** | Zero variance vs Xero TB during `dual_write` / `internal_dual_read` modes. Variance > $0.01 = P0 incident. |
| **Audit immutability** | Posted journals never UPDATE — only INSERT reversals. DB triggers enforce. |
| **Performance** | Ledger TB query for full FY < 500ms. Reconciliation queue < 200ms. Provider call overhead < 5ms. |
| **Backups** | Daily Neon snapshots, 7-year retention. |
| **Security** | Existing RBAC FINANCE permissions. Period-lock enforced at DB layer. Mode-flag changes restricted to `owner` role. |
| **Compliance** | SOC 2 not required (internal only). Revisit at productisation. |
| **Availability** | Same as platform overall. Bank-feed outage degrades gracefully to CSV upload. |
| **Reversibility** | Every mode transition reversible. Flip-back from `internal` → `xero` documented and drilled. |

---

## 8. Technical architecture

Fits existing stack — no new platforms.

| Layer | Use |
|---|---|
| **Frontend** | Nuxt 4 + Nuxt UI v4. New routes: `/agency/finance/ledger`, `/reconciliation`, `/reports`, `/finance/settings`. |
| **Backend** | Nitro endpoints under `server/api/ledger/`, `server/api/banking/`, `server/api/reports/`. All existing `server/api/xero/` routes refactored to consume `FinanceDataProvider`. |
| **Provider layer** | `server/utils/finance/provider.ts` (interface), `server/utils/finance/xeroProvider.ts` (wraps existing calls), `server/utils/finance/internalProvider.ts` (new). |
| **DB** | Neon Postgres. New schema with `ledger_*` prefix. Existing connection pattern (`pg` / `neon()`). |
| **Storage** | R2 — bank statement PDFs, supplier bill attachments, BAS export bundles. |
| **Edge** | Workers — nightly close jobs, Basiq webhook receiver, ABA file generation, TB reconciliation cron. |
| **AI** | Existing Workers AI (OCR) + Groq (NL queries, rule suggestions). |
| **Audit** | Postgres triggers + dedicated `ledger_audit_log` table. |
| **Mode flag** | `FINANCE_PROVIDER` env var, settable per-deployment. UI surface: `/agency/settings/finance` for owner role. |

---

## 9. Data model (high-level)

### New tables

| Table | Purpose |
|---|---|
| `ledger_accounts` | Chart of accounts — id, code, name, type, parent_id, tax_code_default, archived_at |
| `ledger_journals` | Journal entries — id, date, source_type, source_id, narration, created_by, posted_at, voided_by |
| `ledger_journal_lines` | Lines — id, journal_id, account_id, debit, credit, tax_code, dim_client_id, dim_project_id |
| `ledger_bank_accounts` | Bank accounts — id, name, basiq_connection_id, ledger_account_id, balance_cached |
| `ledger_bank_transactions` | Feed transactions — id, bank_account_id, date, amount, description, basiq_id, reconciled_journal_id |
| `ledger_recon_rules` | Auto-coding — id, match_pattern, account_id, tax_code, priority, auto_post_threshold |
| `ledger_period_locks` | Period close — id, period_end, locked_at, locked_by, reopened_at, reopened_by, reason |
| `ledger_audit_log` | Immutable audit — id, table, row_id, action, user_id, before_json, after_json, ts |
| `ledger_provider_state` | Mode-flag history — id, mode, set_at, set_by, reason, last_replay_at |
| `ledger_recon_alerts` | TB drift alerts during dual-write — id, date, xero_balance, internal_balance, delta, account_id, resolved_at |

### Existing tables — augmentations

| Table | Change |
|---|---|
| `invoices` | Add `ledger_journal_id` FK. Existing `xero_invoice_id` remains (used by `XeroProvider`). |
| `bills` | Add `ledger_journal_id` FK. |
| `agency_clients` | Add generic `external_finance_id` column (initially mirrors `xero_contact_id`; future-proofs for multi-provider). |
| `ad_account_client_map` | Rename `xero_client_name` → `external_client_name` over time (alias retained for compatibility). |

### Existing Xero tables — kept

`xero_org_connection`, `xero_contacts_cache`, `xero_invoices_cache`, `xero_customer_rollups`, `xero_tracking_categories` all remain. They become the **storage backing for `XeroProvider`** rather than implicit globals. `client_xero_connections` (currently empty scaffold) stays untouched until productisation.

---

## 10. Integrations

| Integration | Status | Role |
|---|---|---|
| **Basiq** | New | Bank feeds — primary channel (CDR-accredited intermediary) |
| **Xero** | Existing | Role shifts via mode flag: source-of-truth → dual-write target → optional disconnect → flip-back target |
| **Resend** | Existing | Bill capture via email-to-bill, customer statements |
| **Workers AI** | Existing | OCR for bills, embedding for rule suggestions |
| **Groq** | Existing | Natural-language reporting, anomaly narratives |
| **ABA file export** | New | Batch payments for AU bank upload (NAB, CBA, Westpac, ANZ) |

Out of scope: NPP/PayTo, Plaid, Yodlee, Frollo (evaluated, Basiq selected).

---

## 11. Risks & mitigations

Risks updated with audit findings.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **No existing Xero test infrastructure** | Confirmed | Critical | Phase 0 builds the test harness before any toggle work |
| **45 Get-Out endpoints to refactor** | Confirmed | High | Phase 0 treats Get-Out as a single product, refactors via shared `getCashflowForecast()` service |
| **Bookkeeper rejects the tool** | Medium | Critical | Co-design from Phase 1; mirror Xero recon UX; usability testing each phase |
| **Ledger drifts from Xero during dual-write** | Medium | Critical | Nightly TB-reconciliation job, alert on delta > $0.01, populates `ledger_recon_alerts` |
| **Basiq feed gaps / outages** | Medium | High | Manual CSV fallback, missing-transaction detector |
| **Period lock bypassed via direct DB** | Low | Critical | DB-level trigger enforcement, not just app-layer |
| **Engineering cost dwarfs subscription savings** | High | Medium | Reframe value: data truth + AI + future product, not cost-saving |
| **Compliance risk if used for tax filing** | Low | Critical | Out-of-scope; accountant lodges from BAS-prep export |
| **Toggle complexity / mode confusion** | Medium | High | One agency-wide flag, never partial; mode-change requires owner role + reason; full audit log |
| **Flip-back from `internal` → `xero` corrupts data** | Medium | Critical | Replay script tested in non-prod; flip-back drill executed twice in Phase 4 before declaring done |
| **45+ denormalized columns in `xero_customer_rollups`** | Confirmed | Medium | Keep table shape; switch source from Xero cron to internal-ledger query in Phase 3 |
| **Accountant refuses sign-off** | Medium | Critical | Engage accountant in Phase 3 design review; provide Xero-format export |

---

## 12. Success metrics

| Phase | Metric |
|---|---|
| 0 | All Xero calls behind `FinanceDataProvider`. ≥80% test coverage of provider methods. Zero behavioural regressions in production. |
| 1 | Ledger TB matches Xero TB within $0.01 daily for 30 consecutive days |
| 2 | Bookkeeper does ≥80% of weekly reconciliation work in our platform within 6 weeks of go-live |
| 3 | Accountant signs off on a full quarter using only our reports + GL |
| 4 | One entity runs native (`FINANCE_PROVIDER=internal`) for a full FY without incident; flip-back drill executed twice without data loss |
| Cross-cutting | AI anomaly detection precision improves ≥20% post-cutover (raw GL access vs Xero-derived) |
| Cross-cutting | EOM invoicing time-to-send drops ≥30% (no Xero round-trip) |

---

## 13. Open questions

1. **Bank-feed provider** — Basiq looks strongest; still get quotes from Frollo, Adatree before locking
2. **Bookkeeper preference** — Xero-style reconciliation UX or something better? Run UX research before Phase 2
3. **AP capture flow** — OCR-via-email vs supplier portal vs both?
4. **Multi-currency** — needed for any current clients/suppliers? Confirms Phase 1 vs deferred
5. **Existing rate-card + EOM engine** — clean integration with new ledger or refactor required? Phase 0 audit will answer
6. **Cutover plan** — when does mode flip from `xero` → `dual_write`? Best at start of FY26 H2 to align with quarter boundary
7. **Backup audit firm review** — engage now or post-Phase-3?
8. **Get-Out config (`agency_settings`)** — currently hand-tuned; does it become first-class internal-ledger config or stay separate?

---

## 14. Out of scope (explicit)

- Payroll, STP, TPAR, super
- BAS / GST lodgement automation
- Multi-currency (defer until needed)
- Multi-entity / per-client toggle (defer to productisation)
- Activating the `client_xero_connections` per-client OAuth scaffold
- Productisation, multi-tenant, SaaS billing
- Direct payment initiation (NPP, PayTo, ABA-as-API)
- Audit certifications (SOC 2, ISO 27001)
- Tax-agent portal integration

---

## 15. Approval

- [ ] Owner sign-off (Paul)
- [ ] Bookkeeper review
- [ ] Accountant review
- [ ] Technical lead review

---

## Appendix A — Build vs subscription cost

| Item | Cost |
|---|---|
| Xero AU "Established" plan | ~$1,000 / year |
| Basiq bank feeds | ~$600 – $2,400 / year |
| Engineering (1 dev × 12 months loaded) | ~$150,000 |
| **Total Year 1 build cost** | **~$152,000** |
| Annual subscription savings post-cutover | ~$1,000 / year |
| **Subscription-only break-even** | **~150 years** |

→ Build justification is **not** subscription savings. It's data truth, AI capability, EOM friction, optional productisation, and the strategic optionality of the bidirectional toggle.

---

## Appendix B — Phase 0 deliverables (detailed)

Phase 0 is the new prerequisite phase. No functional change for users — pure refactor + tests. Get this right or every later phase pays compounding interest.

1. `FinanceDataProvider` interface — full method enumeration covering 11 reads + 3 writes
2. `XeroProvider` implementation — wraps existing `xeroFetch()`, `xeroInvoiceWriter`, `xeroQuoteWriter`, `xeroCustomerSync` calls verbatim
3. `useFinanceProvider(event)` factory + `FINANCE_PROVIDER` env var (only `xero` valid in Phase 0)
4. Refactor all `server/api/xero/**` endpoints to consume the provider
5. Refactor 45 Get-Out endpoints to use shared `getCashflowForecast()` service via provider
6. Refactor `xeroCustomerSync` cron to call provider
7. Refactor EOM `push-to-xero` flow to call `provider.createInvoice()`
8. Refactor quote → Xero flows similarly
9. Add Vitest tests for `XeroProvider` (mocked HTTP)
10. Add `InternalProvider` stub returning `NotImplementedError` for every method (concrete implementation comes in Phases 1–3)
11. Document the provider contract in `docs/provider-contract.md`
12. Smoke-test: deploy to staging, verify zero behaviour change vs current production

---

## Appendix C — Audit findings (2026-05-04)

Full audit available in chat history. Summary of top 10 highest-friction couplings:

| Rank | Coupling | Files | Mitigation phase |
|---|---|---|---|
| 1 | Get-Out CFO dashboard (45 endpoints, all Xero-dependent) | `server/api/xero/get-out/*.ts`, `getOutConfig.ts` | Phase 0 (refactor) + Phase 3 (replace source) |
| 2 | P&L / Balance Sheet rendered live from Xero | `server/api/xero/reports/{pnl,balance-sheet}.get.ts` | Phase 3 |
| 3 | Customer rollups (45+ denormalized columns, 15-min Xero cron) | `xeroCustomerSync.ts`, `xero_customer_rollups` table | Phase 3 (change source, keep schema) |
| 4 | EOM invoicing — hard-coded Xero contact matching | `xeroInvoiceWriter.ts`, `xero-clients.ts` | Phase 0 + Phase 1 |
| 5 | Ad-spend → Xero client mapping | `spendSync.ts`, `ad_account_client_map.xero_client_name` | Phase 0 (rename to `external_*`) |
| 6 | Customer aging report | `server/api/xero/reports/aging.get.ts`, `xero_invoices_cache` | Phase 3 |
| 7 | Quote → Xero push workflow | `xeroQuoteWriter.ts`, `quotes` table | Phase 0 + Phase 1 |
| 8 | Bank monitoring for anomalies | `server/api/xero/bank-monitoring.get.ts` | Phase 3 |
| 9 | Invoice cache (1000-row Xero pagination cap) | `server/api/xero/invoices.get.ts` | Phase 3 (internal ledger removes the cap) |
| 10 | Customer hub (rollups + contacts cache) | `xeroCustomerSync.ts`, customer hub pages | Phase 3 |

Key data flow stats from the audit:

- **3 push flows** (EOM invoices, quotes, quote→invoice) — easy to make dual-write
- **11 pull flows** — hard, require internal ledger to exist first
- **1 bidirectional flow** — Xero webhook (cache invalidation only)
- **4 Xero-specific tables** — kept; become storage backing for `XeroProvider`
- **6+ `xero_*` FK columns** in core tables (`invoices`, `quotes`, `agency_clients`, `eom_runs`, etc.)
- **0 Xero tests** in the codebase today — Phase 0 fixes this
- **2 already-graceful surfaces** — dashboard "Demo Mode", `require-xero` route middleware. Pieces of the toggle pattern, not the whole.
