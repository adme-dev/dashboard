# Website CMS research: Squarespace, Wix, Framer, Gravity Forms and Base44

Researched 30 September 2026. Official documentation review, not a hands-on usability test or a claim of feature parity. Features can depend on plan, editor version, installed apps and rollout. The recommendations below are XeroFlow design conclusions, separate from the documented competitor behaviour.

Related: [product brief and backlog](2026-09-30-component-management-and-guided-websites.md), [customer CMS standards](../page-studio/customer-cms-standards.md), [managed-component ADR](../decisions/ADR-010-managed-website-component-contracts.md).

The [canonical PRD](../prd/page-studio-customer-cms-prd.md) incorporates these conclusions and owns product scope, delivery order and task status. This document remains the source evidence and comparison.

## Recommendation

Build one customer website dashboard outside the visual builder. Use Squarespace as a reference for approachable editorial workflows, Wix for managing a site's operational tools, Framer for structured content and reusable page bindings, Gravity Forms for a complete form lifecycle, and Base44 for AI generation that connects presentation, data and workflows. These are complementary references, not rankings of the products.

The user's database ownership requirement is independent of these comparisons. A hosted CMS, an external-data connector or an export option does not prove a dedicated customer database. This research makes no assertion about the internal database tenancy of Squarespace, Wix, Framer or Base44.

## What the official documentation establishes

| Product / workflow | Documented behaviour and source | Implication for XeroFlow |
| --- | --- | --- |
| Squarespace: editorial content | A blog contains posts with their own URLs and publishing/scheduling controls. [Blogging guide](https://support.squarespace.com/hc/en-us/articles/206543727-Blogging-with-Squarespace) | Provide a post editor, draft/publish lifecycle and permalink, rather than requiring a separately designed page for every post. |
| Squarespace: galleries | Gallery sections display image sets with configurable layouts; section availability differs between versions 7.0 and 7.1. [Gallery sections](https://support.squarespace.com/hc/en-us/articles/360035636332-Gallery-sections) | Separate the ordered image collection from its layout. A gallery post can reuse both. |
| Squarespace: form storage | Forms need storage; destinations include site contacts and external services. Email storage has a single recipient address and a fixed notification format. [Form and newsletter storage](https://support.squarespace.com/hc/en-us/articles/205814638-Set-up-form-and-newsletter-storage) | Make durable storage automatic and verified. Keep recipient routing and editable customer responses as explicit additional capabilities. |
| Squarespace: contacts | The Contacts panel distinguishes form submitters, customers, members and subscribers among other contact types. [Contacts panel](https://support.squarespace.com/hc/en-us/articles/360046485652-The-Contacts-panel) | One person can have several relationships with a business; an enquiry must not silently become newsletter consent. |
| Squarespace: collaborators | Contributor permissions separate responsibilities such as content, analytics and commerce. [Contributor roles](https://support.squarespace.com/hc/en-us/articles/206537297-Contributor-roles-and-permissions) | A person editing blog posts need not receive billing, integration or enquiry-export access. |
| Wix: operational inbox | Forms & Submissions provides a dashboard entry point across forms, with per-form tables, filtering, export and detail management. Editor links also reach submissions. [Submissions table](https://support.wix.com/en/article/wix-forms-viewing-and-managing-a-submissions-table) | Offer both a site-wide inbox and a form-specific view of the same records. |
| Wix: reusable forms | A form can appear on several pages while retaining one submissions table. [Studio form setup](https://support.wix.com/en/article/studio-editor-adding-and-customizing-a-form) | Distinguish an installed form instance from its page placements; show “Used on” and make duplication semantics explicit. |
| Wix: follow-up | Form automations support email actions, conditions and delays. Separate actions can notify staff and the submitter. A submission trigger is not payment confirmation. [Automated responses](https://support.wix.com/en/article/wix-13) | Separate accepted enquiry, payment state and delivery state. Present a readable trigger → conditions → actions summary. |
| Wix: outbound integrations | An automation can issue an HTTP request with mapped data and a test step. [HTTP request action](https://support.wix.com/en/article/the-new-automation-builder-sending-data-via-webhook) | Provide field mapping and synthetic tests; independently design our signing, retries and egress controls. |
| Wix: content and permissions | CMS collections have item/field management and connections to pages. Collection access rules are distinct from editor dataset settings. [Collection management](https://support.wix.com/en/article/cms-managing-your-collection-content), [collection permissions](https://support.wix.com/en/article/cms-collection-permissions-overview) | Bind content to pages by identity, and enforce access at the data API. Hiding a field in a page is not access control. |
| Wix: people | Contacts, signed-up members and marketing subscribers are separate concepts. [People definitions](https://support.wix.com/en/article/site-members-understanding-the-differences-between-contacts-members-and-subscribers) | Keep contact identity, login access, marketing consent and paid entitlements independently recorded. |
| Wix: team versus visitors | Collaborator roles govern dashboard work; member roles/pricing plans can govern visitor content access. [Collaborator permissions](https://support.wix.com/en/article/about-roles-permissions-contributors), [exclusive member content](https://support.wix.com/en/article/site-members-offering-exclusive-content-to-your-members) | Team invitations must never implicitly create paid members, newsletter subscribers or public visitor accounts. |
| Wix: capability-based self-service | Installed business apps add member pages such as bookings, orders and subscriptions. [Members Area app pages](https://support.wix.com/en/article/site-members-about-the-app-pages-in-your-members-area) | A capability can declare both business-management screens and visitor self-service, with separate permissions. |
| Wix: blog and SEO | The post composer includes author, cover, categories/tags and scheduling. SEO supports per-post settings and defaults across posts. [Post composer](https://support.wix.com/en/article/wix-blog-creating-and-editing-blog-posts-in-the-blog-post-composer), [blog SEO](https://support.wix.com/en/article/wix-blog-customizing-your-blogs-seo-settings) | Use content-type defaults with item overrides, and expose SEO alongside the content being edited. |
| Framer: structured content | CMS fields include rich text, assets, references and image arrays. Stable field IDs preserve bindings. Plugin-managed collections distinguish program-owned and user-editable fields. [CMS developer guide](https://www.framer.com/developers/cms) | Extend our primitive collection types deliberately; AI regeneration must preserve owner edits and stable field identities. |
| Framer: collaboration | Workspace/project roles and granular design, content and deployment permissions govern collaboration. These documented “members” are collaborators. [Roles and permissions](https://www.framer.com/help/articles/member-roles-and-permissions/) | Do not confuse design collaboration with website visitor memberships. Separate editing from publishing. |
| Framer: webhooks | Forms send JSON to HTTPS endpoints. The guide documents signatures, submission IDs, non-followed redirects and up to five retries. [Form webhook setup](https://www.framer.com/help/articles/framer-form-webhook-setup/) | Delivery needs an explicit acknowledgement, signature and retry contract. A webhook connection alone is not an owner enquiry dashboard. |
| Framer: analytics | Built-in reports define pageviews and visitor measurements, explain estimates and use a one-day uniqueness window; link/form tracking is configured separately. [Analytics definitions](https://www.framer.com/help/articles/how-framer-s-built-in-analytics-work/), [link/form tracking](https://www.framer.com/help/articles/how-to-track-links-and-forms-in-framer/) | Display metric definitions, date range and attribution; never silently equate visits, accepted submissions and delivered messages. |
| Gravity Forms: confirmations versus notifications | Confirmations control the visitor's post-submit message/page/redirect; notifications send emails. Conditional confirmations have a default fallback, while email conditions/routing are configured separately. [Confirmations and notifications](https://docs.gravityforms.com/confirmations-and-notifications/) | Use separate “After submission” and “Emails” screens. Show the default outcome and matched conditions in a test preview. |
| Gravity Forms: entry operations | Entry detail includes answers, notes, print and notification resend actions. [Entry detail](https://docs.gravityforms.com/entry-detail/) | Treat the entry as the centre of follow-up. Our design preserves original answers and audits corrections instead of silently overwriting them. |
| Gravity Forms: integration feeds | Add-ons use configured feeds to connect forms to services. Webhook feeds support field mapping, request configuration and conditions. [Feed concepts](https://docs.gravityforms.com/what-is-a-feed/), [Webhooks Add-On](https://docs.gravityforms.com/triggering-webhooks-form-submissions/) | Implement a trusted connection/action model; expose “Integrations” rather than requiring customers to understand feeds or Workers. Webhooks are documented as an add-on, not an assumed core feature. |
| Gravity Forms: data lifecycle | Per-form personal-data settings include IP storage choice, retention and integration with export/erasure tools. [Personal data settings](https://docs.gravityforms.com/personal-data-settings/) | Make retention and export/deletion part of the component contract and operation screens, with delivery/attachment cleanup rules. |

## Base44: generated applications, data and management

Added after the user requested Base44 explicitly. Its documentation describes AI creating design, data and functionality on a managed backend with authentication, integrations and hosting. This makes it a useful architectural reference for our managed components. [Base44 overview](https://docs.base44.com/)

| Area | Documented Base44 behaviour | Implication for XeroFlow |
| --- | --- | --- |
| Data and management | AI sets up typed tables/entities. Builders use Dashboard → Data to search, filter, edit, import/export and inspect records; fields can reference files and other tables. [Data management](https://docs.base44.com/Building-your-app/Managing-your-app-data) | Generate the data contract with the feature, then provide an appropriate customer operating view over those records. |
| Builder versus live-app access | Owners/collaborators access the editor and its dashboard. Live-app Admin/User roles govern the published application and do not independently grant builder access. [Access and roles](https://docs.base44.com/Setting-up-your-app/Managing-access) | A customer's enquiry operator needs operational access without becoming a builder collaborator. Keep those permissions distinct. |
| Authentication | Base44 supplies authentication and supports generated custom login/registration pages; its guide covers password recovery and protecting selected pages. [Login and registration](https://docs.base44.com/Setting-up-your-app/Managing-login-and-registration) | Reuse established authentication while allowing a coherent branded customer entry. Route protection still needs data authorization. |
| Data permissions | Tables have create/read/update/delete rules. Its contact-form example allows public creation but restricts reading and management to administrators. AI can propose permissions and the dashboard exposes them for review. [Data permissions](https://docs.base44.com/Setting-up-your-app/Managing-security-settings) | Every generated form needs separately validated public submission and private inbox policies; a generated admin screen alone does not protect records. |
| Workflows | AI creates workflows with triggers, ordered function steps, waits and conditions. A dashboard shows diagrams and run history. Editing steps creates a version; in-flight runs retain their original version. [Workflows](https://docs.base44.com/Building-your-app/Creating-workflows) | Generate reviewable follow-up rules alongside components and preserve the version used for each accepted event. |
| Email | Built-in transactional email and external providers such as Resend are separate options. Recipient eligibility depends on plan/domain setup; built-in email does not support external mailing lists or attachments. [Sending email](https://docs.base44.com/documentation/building-your-app/sending-emails) | Make delivery readiness and provider choice explicit. Newsletter management is more than an email action. |
| Paid subscriptions | The Stripe guide supplies suggested prompts for subscription purchase, cancellation and access changes. These describe generated flows using a connected payment provider. [Stripe setup](https://docs.base44.com/documentation/setting-up-your-app/setting-up-payments) | Model payment and entitlement lifecycles as a tested capability; a prompt example does not prove renewal, cancellation or retry correctness. |

### What its approach means for our product

Conceptually, our requested “quote form with an admin section” should produce a visible form, an enquiry data model, authorized submit/read operations, an inbox, configuration and follow-up rules as one reviewed feature. This is our interpretation of the useful pattern, not a claim that Base44 always generates that exact bundle or a standardized Gravity Forms-style settings screen.

Base44's generic Data dashboard belongs to the builder environment. Customer-facing operational admin pages inside a generated app are a different surface. Our product should provide a consistent customer CMS automatically for supported capabilities, including nontechnical names such as Enquiries, Posts and Gallery, rather than making every customer prompt for and maintain their own management UI.

Three implementation lessons join the existing backlog:

- RND-02/RND-09: generation must bind UI, data, permissions and admin presentation together. Show a reviewable change summary and preserve owner edits; AI-generated permission proposals remain subject to trusted validation.
- RND-06/RND-07: show workflow conditions and delivery history in customer terms. Base44 documents that its **Run now** can perform real actions even when the run is labelled a test. Our test interface must explicitly distinguish simulation, isolated test destinations and real delivery/replay. [Workflow testing behaviour](https://docs.base44.com/Building-your-app/Creating-workflows)
- RND-03/RND-14/RND-15: test visitor, member, enquiry operator and publisher access independently. Base44's distinction between builder collaboration and live-app roles reinforces this boundary. [Role distinction](https://docs.base44.com/Setting-up-your-app/Managing-access)

Base44's managed data layer and exports are not evidence of a dedicated database controlled by each customer. Our customer-database requirement remains unchanged. This addition verifies documentation only: no generated app, checkout, permission test or workflow was executed on Base44.

## Proposed customer experience

The customer signs in, chooses a website, and lands on its CMS overview. The overview shows real setup tasks, recent enquiries and publishing status. “Edit website” opens Page Studio. Day-to-day operations do not require the canvas.

Use task-oriented navigation, with advanced or unused capabilities revealed when relevant:

| Area | Customer tasks |
| --- | --- |
| Website | Pages and navigation, blog posts, galleries, other content collections, media, SEO, publishing history |
| Business | Enquiries and forms; bookings, products/orders and paid subscriptions when installed |
| Audience | Contacts, website members, newsletter audiences and consent |
| Insights | Website and component analytics, delivery health |
| Settings | Team invitations and roles, domains, email/integrations, privacy/retention, plan and AI credits |

“Components” remains a library/advanced view, but users primarily see names such as Contact form, Blog or Appointments. Installing a form registers its management screen automatically. Installing a decorative heading does not create empty database tables or inbox navigation.

### Form workspace informed by Gravity Forms

Proposed navigation: **Overview · Entries · Fields · After submission · Emails · Integrations · Insights**. Privacy, retention and archive controls belong in form settings; placement links stay visible in Overview.

- Entries: search/filter, live/test separation, assignment/status, immutable answers, notes and per-delivery history.
- Fields: typed inputs, labels/help, accessible validation, consent and conditional visibility. Published schema versions retain stable IDs.
- After submission: default message or approved page, optional ordered conditional outcomes, and a test-input preview. Sensitive answers must not be placed in redirect query strings by default.
- Emails: separate team notification and customer acknowledgement; typed template variables, verified sender, preview and delivery status.
- Integrations: named destination, event, allowed field mapping, conditions, synthetic test, enable/disable and attempts. Sending a saved enquiry elsewhere must not create another enquiry.
- Insights: starts, durable acceptances and relevant conversion events with explicit denominators and exclusions.

These are our proposed controls. Signed payload timestamps, replay windows, atomic outbox writes, immutable submissions and network isolation remain our requirements; the competitor UI documentation does not prove those implementation properties.

## Data and access principles

The customer database is the authoritative store for their website content and operational records. Media files can reside in scoped object storage; their ownership, metadata and references belong to that customer's database. Shared platform identity, billing and deployment authorization remain a separately documented control-plane responsibility, not a duplicate enquiry/content database.

Do not use one overloaded “subscriber” flag. Distinguish:

1. Invited website owner/team member with CMS permissions.
2. Contact who has interacted with the business.
3. Website member who can authenticate to visitor-facing features.
4. Newsletter subscriber with purpose-specific consent and suppression state.
5. Paying customer with provider-verified subscription and access entitlement.

One person may occupy multiple categories; none automatically confers another. Newsletter signup must work without requiring a visitor account. Cancelling a paid plan and unsubscribing from marketing are different operations.

## What remains unverified

- No authenticated competitor workflow was exercised, and no form, invitation, payment or external message was sent during this research.
- Framer's cited collaborator roles do not establish a native visitor membership, newsletter campaign or recurring-billing system. Those areas need separate native/integration verification if used for feature-parity claims.
- Wix's basic form success configuration does not by itself establish the ordered conditional redirect behaviour proposed here. Gravity Forms supplies the clearer documented reference for conditional confirmations.
- Exact pricing, limits, add-on licences and delivery guarantees were not benchmarked. Do not build entitlements from this report.
- Competitor docs do not establish our storage topology, backup/export guarantees, security controls or legal compliance. Those need implementation evidence.

## Implementation consequence

Start with the customer-database adapter and a complete form/inbox journey, then extend the same management contract to editorial content and audience features. The [canonical PRD](../prd/page-studio-customer-cms-prd.md#8-delivery-order-and-canonical-backlog) maps this research to the maintained backlog. The research is complete as a documentation review; the broader CMS implementation remains open.
