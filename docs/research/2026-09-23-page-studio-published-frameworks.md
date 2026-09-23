# Published customer frontend: framework investigation

Status: user selected Astro on 23 September; implementation started in Studio
branch `feat/astro-publishing`. No Astro migration has been deployed.
Date: 23 September 2026.

The comparison below records the decision context. Follow the Studio spec and
plan `docs/superpowers/{specs,plans}/2026-09-23-astro-publishing*` for implementation.
React remains the editor and initial interactive island framework. Nuxt/SvelteKit
prototypes are no longer prerequisites: the user has selected Astro.

## User requirement

The React editor must not unnecessarily dictate the customer website framework.
Evaluate Astro, Svelte/SvelteKit and Vue/Nuxt for public websites and customer
applications, including AI-created components, CMS schemas/admin and scoped
Worker actions. Preserve completed platform work and existing customer content.

## Verified implementation

Inspected Studio source at `9939b03c2b75ebd53f77e6b966f5bd6d200bd26a`:

- `packages/site-kit/src/render/render-manifest.tsx` resolves manifest nodes
  through a React component registry and calls `renderToStaticMarkup`.
- `services/build-worker/src/build.ts` and `staging-build.ts` produce HTML
  routes and separate browser runtime assets using that renderer.
- `services/delivery-worker/src/published-feature-page.ts` also uses the same
  renderer for published feature content. Server-composed content does not
  imply a browser React application.
- The existing menus/tabs/motion runtime does not provide a general client router.
- Native XeroFlow admin uses Nuxt/Vue. The Studio editor uses React.

Browser interaction does not require request-time server rendering. Conditional
fields, local validation and visual state can run in browser JavaScript. Protected
reads, writes, authoritative validation and secret-bearing actions remain behind
scoped APIs. The framework decision must not weaken that boundary.

## Comparison

The fit assessments below are engineering judgments, not measured benchmarks.

| Candidate | Documented capability | Fit to investigate | Migration work |
| --- | --- | --- | --- |
| Current React renderer plus browser runtime | React can attach browser behaviour to suitable server HTML or mount browser components | Baseline for reuse and interactive applications | Replace static-only rendering where needed, package client code, add routing/lifecycle support |
| Astro with one supported island framework | Static page output plus opt-in interactive components; official React/Vue/Svelte integrations | First website-oriented prototype: content pages, fleet collections and booking widgets | Adapt manifest export and component entry points; validate serialization, CSP, asset hashes and editor parity |
| Nuxt/Vue | Server, client and per-route hybrid rendering | First application-oriented alternative: portals, admin and multi-step workflows; uses existing team stack | Port React renderers to Vue or define a separate export adapter; do not embed customer code in agency admin |
| SvelteKit | Per-route prerendering, server/client rendering and client routing; Cloudflare adapter | Challenger for component authoring and app interaction | New component implementation/compiler path, generator conventions and editor preview integration |

Astro can host React components, but our existing static export is not
automatically an interactive Astro component. Arbitrary functions/closures cannot
be treated as ordinary serialized component props. Framework portability requires
an explicit component contract and implementation, not only a framework selector.

Astro's optional client router can intercept navigation; its integration still
needs script initialization, teardown, focus, history and animation tests. Smooth
navigation alone is not evidence of a complete application runtime.

## Proposed bounded evaluation

- [x] Confirm current published renderer and browser runtime boundaries.
- [x] Compare official rendering and integration documentation.
- [ ] Use one representative fixture: fleet collection, vehicle detail,
  conditional booking form and authenticated booking-admin view.
- [ ] Establish current renderer/browser-runtime baseline with the same fixture.
- [ ] Prototype Astro with a single supported component framework, initially
  React to measure actual reuse rather than assume it.
- [ ] Prototype Nuxt against identical CMS/action contracts and customer scope.
- [ ] Include SvelteKit if its component-authoring/build tradeoffs justify a third
  prototype; document the comparison without assuming it is inherently easier.
- [ ] Measure build duration/peak memory, artifact and browser-JS sizes, first
  interaction, navigation and repeatable AI generation/edit success.
- [ ] Verify visual-editor selection, property/field editing, responsive layout,
  draft/save/restore, shared state, Back/Forward and direct nested URLs.
- [ ] Verify CMS writes, duplicate submission recovery, accessibility, browser
  cleanup, GSAP lifecycle where used, and Safari/Chrome behaviour.
- [ ] Verify two-client isolation, preview/production separation, Worker limits,
  dependency controls, package limits and rollback of the complete release.
- [ ] Select one initial publishing contract in an ADR based on those results.

Do not introduce every supported framework as a customer option. Multiple
compilers and runtimes multiply generation, preview, security and regression work.
Preserve page/component IDs, collection/action contracts, versions and releases
through an exporter change. No new framework downloads or benchmark builds were
performed during this documentation pass.

## Official sources checked

- [React static markup](https://react.dev/reference/react-dom/server/renderToStaticMarkup): static output cannot be hydrated.
- [React incremental integration](https://react.dev/learn/add-react-to-an-existing-project): browser components can be added progressively.
- [Astro islands](https://docs.astro.build/en/concepts/islands/): opt-in browser interactivity and separate server islands.
- [Astro framework integrations](https://docs.astro.build/en/guides/framework-components/): React, Vue and Svelte support and client directives.
- [Astro navigation](https://docs.astro.build/en/guides/view-transitions/): optional client router and script lifecycle considerations.
- [Nuxt rendering](https://nuxt.com/docs/4.x/guide/concepts/rendering): universal, client and hybrid route rendering.
- [SvelteKit page options](https://svelte.dev/docs/kit/page-options): route-level rendering options and client router.
- [SvelteKit Cloudflare adapter](https://svelte.dev/docs/kit/adapter-cloudflare): deployment support.
