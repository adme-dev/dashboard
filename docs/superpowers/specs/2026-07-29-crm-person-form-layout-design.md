# CRM Person Form and Slideover Layout Design

## Goal

Make the CRM person editor comfortable to scan and edit on desktop while remaining usable on mobile, without changing CRM data, validation, preference persistence, or save behaviour.

## Scope

This change covers:

- the person/company record slideover;
- the built-in and custom fields in `CrmRecordForm`;
- lifecycle stage, tags, and owner controls;
- the person-only contact-preference section.

It does not change APIs, payloads, field definitions, contact-preference rules, or other CRM slideovers.

## Layout

The record slideover will retain Nuxt UI's standard full-width mobile behaviour and override the desktop content width to `sm:max-w-xl`. The override will use the supported `ui.content` slot instead of custom CSS.

Each form section will be a CSS container or live within one. Field grids will:

- start at one column;
- switch to two columns at the `@lg` container breakpoint;
- use a consistent `gap-4`;
- make unpaired fields span both columns when expanded.

The wider desktop panel provides enough content width for two readable fields per row. Narrow panels and mobile screens stack the same fields automatically.

## Controls

All `UInput`, `USelect`, `USelectMenu`, `UInputTags`, and textarea-like field controls will explicitly use `class="w-full"` inside their grid cells. Checkboxes and switches remain intentionally compact.

The lifecycle help text stays attached to its `UFormField`. Owner remains a full-span field. Custom fields follow the same responsive grid as built-in fields.

## Contact Preferences

The contact-preference component will become container-responsive. Its preference controls start in one column and move to two columns only when the component is wide enough. The four opt-out switches remain full-width rows with their existing labels, disabled states, and immediate-save behaviour.

## Behaviour and Accessibility

Existing component props, events, model values, validation, and PATCH requests remain unchanged. Nuxt UI continues to provide dialog focus management, visible labels, keyboard interaction, and switch semantics.

## Verification

A source contract test will reproduce the current rigid composition and require:

- the `sm:max-w-xl` slideover content override;
- container-aware single-to-two-column grids in the record form;
- full-width built-in, lifecycle, tags, and custom-field controls;
- responsive contact-preference controls;
- no unconditional `grid-cols-2` in either component.

The focused test must be observed failing before implementation and passing afterward. ESLint, Nuxt preparation, the enforced CI suites, and the production build will run before publication.
