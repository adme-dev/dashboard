# CRM Opportunity Form Layout Design

## Goal

Make the CRM opportunity editor readable and professional in the client portal slideover without changing its data, validation, or submission behaviour.

## Design

The form becomes its own CSS container. Its field grid starts as one column and changes to two columns only when the form container reaches the `@lg` container breakpoint. This responds to the slideover's actual width rather than the browser viewport, so a narrow desktop overlay no longer receives a cramped desktop grid.

Name, owner, and notes remain full-width. Stage and amount, then company and contact, become paired fields only when enough container width is available. Every Nuxt UI input, select menu, and textarea explicitly fills its grid cell with `w-full`.

The existing `UFormField`, `UInput`, `USelectMenu`, `UTextarea`, and `UButton` components remain in place. `USelectMenu` remains appropriate for company and contact because those entity lists benefit from search.

## Agent Form Contract

The project `AGENTS.md` form guidance will require:

- mobile-first, single-column form grids;
- container-query variants for forms inside slideovers, modals, cards, and sidebars;
- full-width Nuxt UI controls by default;
- full-span fields for long text and unpaired controls;
- no unconditional two-column grid in a narrow surface.

## Verification

A source contract test will fail on the current rigid layout and pass only when the opportunity form:

- declares a container;
- uses a single-column base grid with a two-column container breakpoint;
- makes each interactive form control full width;
- makes the owner field span both columns when the grid expands.

The focused test and Nuxt type generation will be run after implementation.
