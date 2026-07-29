# CRM Opportunity Form Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the CRM opportunity editor a professional, width-aware Nuxt UI form layout and record the reusable project convention.

**Architecture:** Keep the existing form behaviour and components. Use a CSS container on the form, a single-column base grid, an `@lg:grid-cols-2` container breakpoint, and full-width controls.

**Tech Stack:** Nuxt 4, Vue 3, Nuxt UI v4, Tailwind CSS v4 container queries, Vitest.

## Global Constraints

- Use Nuxt UI v4 components for every form control.
- Preserve the existing opportunity payload, validation, and events.
- Make layout decisions from the form container width inside overlays.
- Use `UFormField` for every field label and error.

---

### Task 1: Opportunity form composition

**Files:**
- Create: `test/app/crmOpportunityFormLayout.test.ts`
- Modify: `app/components/crm/OpportunityForm.vue`

**Interfaces:**
- Consumes: the existing `CrmOpportunityForm` props and `submit`/`cancel` events.
- Produces: the same component interface with a responsive presentation contract.

- [x] **Step 1: Write the failing source contract test**

Assert that the form has `@container`, that the field grid has `grid-cols-1` and `@lg:grid-cols-2`, that all five single-line controls and the textarea use `w-full`, and that Owner uses `@lg:col-span-2`.

- [x] **Step 2: Run the focused test and verify RED**

Run `pnpm vitest run test/app/crmOpportunityFormLayout.test.ts`.

Expected: failure because the current form uses an unconditional `grid-cols-2` and intrinsic-width controls.

- [x] **Step 3: Implement the minimal responsive composition**

Add the container, responsive grid classes, full-width control classes, and responsive owner span without changing form logic.

- [x] **Step 4: Run the focused test and verify GREEN**

Run `pnpm vitest run test/app/crmOpportunityFormLayout.test.ts`.

Expected: one passing test file with no failures.

### Task 2: Project form-layout guidance and verification

**Files:**
- Modify: `AGENTS.md` in the primary workspace.

**Interfaces:**
- Consumes: the existing mandatory Form Design instructions.
- Produces: a canonical container-aware Nuxt UI grid rule for future agents.

- [x] **Step 1: Replace the unconditional paired-field rule**

Document single-column defaults, overlay container queries, `w-full` controls, and responsive full-span fields.

- [x] **Step 2: Re-read every modified file**

Confirm no behavioural code changed, no duplicate UI was introduced, every field remains inside `UFormField`, and select values retain their current non-empty identifiers.

- [x] **Step 3: Run focused and project validation**

Run the focused Vitest file and `pnpm exec nuxt prepare`.

Expected: both commands exit successfully.
