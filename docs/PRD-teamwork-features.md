# PRD: Enhanced Agency Platform Features
## Inspired by Teamwork.com Analysis

**Version:** 1.0
**Created:** 2024-12-16
**Status:** In Progress

---

## Executive Summary

This PRD outlines the implementation of 6 major feature sets to enhance our agency management platform, bringing it to feature parity and beyond Teamwork.com's offerings while maintaining our unique architecture (Zero sync, Neon Postgres, Xero integration).

---

## Feature 1: AI-Powered Project Generation

### Overview
Enable users to generate complete project structures from natural language descriptions, including phases, tasks, team assignments, and budget allocations.

### User Stories
- As a PM, I want to describe a project in plain text and get a suggested structure
- As a PM, I want AI to recommend team assignments based on skills and availability
- As a PM, I want to see estimated timelines based on similar past projects

### Database Schema
```sql
-- ai_project_suggestions: Store AI-generated project plans
-- ai_generation_history: Track usage and feedback for model improvement
```

### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/agency/ai/generate-project` | Generate project structure from description |
| POST | `/api/agency/ai/suggest-assignments` | Get smart team assignment recommendations |
| POST | `/api/agency/ai/estimate-timeline` | Get AI-estimated timeline |
| GET | `/api/agency/ai/suggestions/:id` | Retrieve saved suggestion |
| POST | `/api/agency/ai/suggestions/:id/apply` | Apply suggestion to create project |

### Tasks
- [ ] 1.1 Create AI suggestions database schema
- [ ] 1.2 Implement project generation endpoint
- [ ] 1.3 Implement smart assignment algorithm
- [ ] 1.4 Implement timeline estimation
- [ ] 1.5 Create suggestion storage and retrieval
- [ ] 1.6 Add feedback loop for improvement

### Success Metrics
- 70%+ of generated projects require <20% modification
- 50% reduction in project setup time

---

## Feature 2: Intake Forms System

### Overview
Dynamic form builder for capturing client work requests, with automatic routing and optional project creation.

### User Stories
- As an account manager, I want to send clients a form link to request work
- As a PM, I want intake submissions to automatically create draft projects
- As a department lead, I want submissions routed to my team for review

### Database Schema
```sql
-- intake_forms: Form definitions with dynamic fields
-- intake_form_fields: Individual field configurations
-- intake_submissions: Submitted form data
-- intake_submission_attachments: Files attached to submissions
```

### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agency/intake/forms` | List all intake forms |
| POST | `/api/agency/intake/forms` | Create new intake form |
| GET | `/api/agency/intake/forms/:id` | Get form definition |
| PUT | `/api/agency/intake/forms/:id` | Update form |
| DELETE | `/api/agency/intake/forms/:id` | Delete form |
| GET | `/api/agency/intake/forms/:id/public` | Public form for clients |
| POST | `/api/agency/intake/forms/:id/submit` | Submit form (public) |
| GET | `/api/agency/intake/submissions` | List submissions |
| GET | `/api/agency/intake/submissions/:id` | Get submission details |
| PUT | `/api/agency/intake/submissions/:id` | Update submission status |
| POST | `/api/agency/intake/submissions/:id/convert` | Convert to project |

### Tasks
- [ ] 2.1 Create intake forms database schema
- [ ] 2.2 Implement form CRUD endpoints
- [ ] 2.3 Implement public form endpoint (no auth)
- [ ] 2.4 Implement submission handling
- [ ] 2.5 Implement submission-to-project conversion
- [ ] 2.6 Add notification routing for new submissions

### Success Metrics
- 80% of client requests come through forms vs email
- <24hr average response time to submissions

---

## Feature 3: Resource Forecasting & Capacity Planning

### Overview
Forward-looking capacity management with visual heatmaps showing team availability across upcoming weeks.

### User Stories
- As a resource manager, I want to see team capacity for the next 8 weeks
- As a PM, I want to know who's available before assigning work
- As leadership, I want early warning when we're over/under capacity

### Database Schema
```sql
-- resource_forecasts: Weekly capacity snapshots
-- capacity_adjustments: PTO, holidays, reduced availability
-- resource_skills: Team member skills for smart matching
```

### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agency/capacity/forecast` | Get capacity forecast |
| GET | `/api/agency/capacity/team/:id` | Individual capacity |
| GET | `/api/agency/capacity/department/:id` | Department capacity |
| POST | `/api/agency/capacity/adjustments` | Add capacity adjustment |
| GET | `/api/agency/capacity/availability` | Find available resources |
| GET | `/api/agency/capacity/heatmap` | Visual heatmap data |

### Tasks
- [ ] 3.1 Create resource forecasting database schema
- [ ] 3.2 Implement capacity calculation logic
- [ ] 3.3 Implement forecast generation (cron job)
- [ ] 3.4 Implement capacity adjustments (PTO, etc.)
- [ ] 3.5 Implement availability search endpoint
- [ ] 3.6 Create heatmap data endpoint

### Success Metrics
- 90% forecast accuracy within 2 weeks
- Zero over-allocation incidents

---

## Feature 4: Creative Proofs & Annotations

### Overview
Visual proofing system allowing clients to leave feedback directly on images, PDFs, and videos with pinpoint annotations.

### User Stories
- As a designer, I want clients to mark exact spots needing changes
- As a client, I want to approve/reject deliverables with clear feedback
- As a PM, I want to track proof versions and approval history

### Database Schema
```sql
-- creative_proofs: Proof versions linked to deliverables
-- proof_annotations: Positioned comments on proofs
-- proof_approvals: Approval decisions with signatures
```

### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agency/proofs` | List proofs |
| POST | `/api/agency/proofs` | Create new proof |
| GET | `/api/agency/proofs/:id` | Get proof with annotations |
| POST | `/api/agency/proofs/:id/annotations` | Add annotation |
| PUT | `/api/agency/proofs/:id/annotations/:annotationId` | Update annotation |
| DELETE | `/api/agency/proofs/:id/annotations/:annotationId` | Delete annotation |
| POST | `/api/agency/proofs/:id/approve` | Approve proof |
| POST | `/api/agency/proofs/:id/request-changes` | Request changes |
| GET | `/api/agency/proofs/:id/versions` | Get version history |

### Tasks
- [ ] 4.1 Create creative proofs database schema
- [ ] 4.2 Implement proof CRUD endpoints
- [ ] 4.3 Implement annotation system
- [ ] 4.4 Implement approval workflow
- [ ] 4.5 Implement version management
- [ ] 4.6 Add proof expiration/auto-approve logic

### Success Metrics
- 60% reduction in revision rounds
- 90% of feedback captured in-platform vs email

---

## Feature 5: Automation Rules Engine

### Overview
User-configurable automation rules that trigger actions based on events, reducing manual work.

### User Stories
- As a PM, I want tasks auto-assigned when moved to specific status
- As an account manager, I want notifications when budgets hit thresholds
- As a team lead, I want parent tasks to auto-complete when subtasks done

### Database Schema
```sql
-- automation_rules: Rule definitions
-- automation_triggers: Event types and conditions
-- automation_actions: Action configurations
-- automation_logs: Execution history
```

### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agency/automations` | List automation rules |
| POST | `/api/agency/automations` | Create automation rule |
| GET | `/api/agency/automations/:id` | Get rule details |
| PUT | `/api/agency/automations/:id` | Update rule |
| DELETE | `/api/agency/automations/:id` | Delete rule |
| POST | `/api/agency/automations/:id/toggle` | Enable/disable rule |
| GET | `/api/agency/automations/:id/logs` | Get execution history |
| GET | `/api/agency/automations/triggers` | List available triggers |
| GET | `/api/agency/automations/actions` | List available actions |

### Tasks
- [ ] 5.1 Create automation rules database schema
- [ ] 5.2 Define trigger types and conditions
- [ ] 5.3 Define action types and handlers
- [ ] 5.4 Implement rule CRUD endpoints
- [ ] 5.5 Implement rule execution engine
- [ ] 5.6 Implement execution logging
- [ ] 5.7 Add built-in rule templates

### Success Metrics
- 500+ automations triggered per week
- 30% reduction in manual status updates

---

## Feature 6: Project Health Dashboard

### Overview
At-a-glance project health scoring with visual indicators for schedule, budget, and overall status.

### User Stories
- As leadership, I want to see all at-risk projects instantly
- As a PM, I want early warning when projects trend unhealthy
- As an account manager, I want client-facing health reports

### Database Schema
```sql
-- project_health_snapshots: Daily health calculations
-- project_health_factors: Configurable health weights
-- health_alerts: Generated alerts for attention
```

### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agency/health/projects` | All projects health summary |
| GET | `/api/agency/health/projects/:id` | Single project health details |
| GET | `/api/agency/health/portfolio` | Portfolio-level health |
| GET | `/api/agency/health/trends` | Health trends over time |
| GET | `/api/agency/health/at-risk` | List at-risk projects |
| PUT | `/api/agency/health/factors` | Configure health weights |

### Tasks
- [ ] 6.1 Create project health database schema
- [ ] 6.2 Implement health calculation algorithm
- [ ] 6.3 Implement health snapshot generation
- [ ] 6.4 Implement health API endpoints
- [ ] 6.5 Implement at-risk detection
- [ ] 6.6 Add health trend analysis

### Success Metrics
- 95% of at-risk projects identified >1 week early
- Zero project failures without prior health warning

---

## Implementation Priority

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| P0 | Intake Forms | Medium | High |
| P0 | Project Health Dashboard | Medium | High |
| P1 | Automation Rules Engine | High | High |
| P1 | Resource Forecasting | Medium | High |
| P2 | Creative Proofs | High | Medium |
| P2 | AI Project Generation | High | Medium |

---

## Technical Considerations

### Dependencies
- All features use existing `requireAuth` middleware
- All features integrate with Zero sync via `queryOne`/`queryRows`
- Notifications use existing `createNotification` utility

### Performance
- Health calculations run as background jobs
- Capacity forecasts regenerate nightly
- Automation rules evaluated on event triggers

### Security
- Public intake forms use rate limiting
- Proof links use secure tokens
- Automation rules scoped to user permissions

---

## Timeline Estimate

| Phase | Features | Duration |
|-------|----------|----------|
| Phase 1 | Intake Forms, Project Health | 1 sprint |
| Phase 2 | Automation Engine, Forecasting | 1 sprint |
| Phase 3 | Creative Proofs, AI Generation | 1 sprint |

---

## Appendix: Integration Notes

### Excluded (per requirements)
- ❌ QuickBooks (using Xero)
- ❌ HubSpot (future roadmap)

### Existing Integrations to Leverage
- ✅ Xero for invoicing
- ✅ Zero for real-time sync
- ✅ Neon Postgres for persistence
