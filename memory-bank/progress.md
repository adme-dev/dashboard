# Progress

## What Works
- Nuxt UI Dashboard template present and ready
- Project documentation (Memory Bank) initialized from PRD
- Xero OAuth 2.0 integration (login, callback, token refresh)
- Basic KPI dashboard with Xero data
- **Agency Platform Foundation (NEW)**
  - Postgres database schema for agency entities
  - Zero sync configuration and schema
  - Agency-specific Chart of Accounts (COA)
  - TypeScript types for all agency entities
  - Agency dashboard page with KPIs
  - Projects list page with profitability tracking
  - Clients management page
  - API endpoints for agency data

## In Progress
- Connect Zero sync to Postgres database
- Build profitability dashboard components
- Integrate agency data with Xero contacts/invoices

## Next Up
- Set up Neon/Supabase Postgres database
- Deploy Zero cache server
- Implement time entry tracking UI
- Add media spend reconciliation
- Build utilization dashboards
- Create invoice generation from time/expenses

## Agency Platform - Implementation Status

### Completed
1. **Database Schema** (`server/database/schema.sql`)
   - Chart of Accounts with agency-specific categories
   - Agency Clients with billing types (retainer, project, hybrid, commission)
   - Projects with budget tracking
   - Time Entries with billable/non-billable support
   - Project Expenses with categories
   - Media Spend tracking by platform
   - Agency Invoices and line items
   - Retainer period management
   - Profitability and utilization views

2. **Zero Sync Schema** (`app/zero/schema.ts`)
   - Client-side schema definitions
   - Table relationships
   - Permissions configuration
   - Type exports

3. **Zero Composables** (`app/composables/useZero.ts`)
   - useAgencyClients()
   - useProjects()
   - useProjectProfitability()
   - useUtilization()
   - useChartOfAccounts()
   - useMediaSpend()
   - Mutation helpers

4. **TypeScript Types** (`app/types/index.d.ts`)
   - AgencyClient, Project, TimeEntry
   - ProjectExpense, MediaSpend
   - AgencyInvoice, AgencyInvoiceLine
   - RetainerPeriod
   - ProjectProfitability, ClientProfitability
   - UtilizationMetrics, AgencyKPIs
   - BudgetPacing

5. **Pages**
   - `/agency` - Main dashboard with KPIs
   - `/agency/projects` - Projects list with profitability
   - `/agency/clients` - Client management

6. **API Endpoints**
   - GET `/api/agency/kpis` - Agency KPIs
   - GET `/api/agency/projects` - Projects list
   - GET `/api/agency/projects/summary` - Project summary
   - GET `/api/agency/clients` - Clients list
   - GET `/api/agency/time/recent` - Recent time entries

7. **Components**
   - `AgencyClientForm` - Create/edit client form

### Pending
- Postgres database setup (Neon recommended)
- Zero cache server deployment
- Time entry UI components
- Project detail page
- Client detail page
- Media spend tracking UI
- Invoice generation
- Budget pacing alerts
- Xero sync for contacts/invoices

## Known Issues/Risks
- Zero SDK is in alpha - may have breaking changes
- Need to implement proper row-level security for multi-tenant
- Rate limits require careful batching and caching strategy
- Media platform API integrations not yet implemented

## Architecture Decisions
- **Database**: Postgres (via Neon or Supabase) for Zero compatibility
- **Sync**: Rocicorp Zero for real-time, local-first sync
- **COA Structure**: Agency-specific 5-digit account codes
- **Billing Types**: Support for retainer, project, hybrid, commission models
- **KPIs**: Industry-standard agency metrics (utilization, margin, MRR)
