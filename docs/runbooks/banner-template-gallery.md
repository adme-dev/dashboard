# Banner Studio template gallery

The gallery at `/agency/banner-studio/templates` combines starting formats and saved artwork. **Suggested**, **Display**, **Social**, **Print**, **Digital**, **Sets**, and **Video** show blank starting canvases. **Saved** shows native and HTML templates. **Sets** also filters saved native templates to those with multiple layouts.

## Create or reuse a set

Choose a preset or saved native template, select the layouts, name the project, and optionally assign a client and folder. Creation saves a draft before opening the editor. Saved native templates copy their layers, media references and playback metadata independently. HTML templates continue to create an HTML banner instance.

The five presets are Display Design Set (23 sizes), Performance Max (3), Social Campaign (8), Social Posts (5), and Video Design Set (6). Individual formats are also available. The catalogue contains 51 choices: five sets and 46 individual formats. Two choices can share dimensions while serving different purposes, such as Presentation and FHD Slideshow.

To save a reusable set, open the editor’s **Actions → Save as template**. This saves the latest project artwork first, then captures every layout. The dialog displays the layout count. A failed project save prevents template creation. The source snapshot and gallery lists use fresh database reads.

If draft creation loses its response or returns an uncertain server failure, inspect **View drafts** before creating another copy. Ordinary project creation does not guarantee idempotent replay; the modal blocks a second dispatch after an uncertain result.

## Delete a template

Use the trash button or **… → Delete template**, then confirm. Creative users can delete their own non-system templates. Administrators with creative access can delete other creators’ or system templates. Read-only roles cannot delete.

Native projects retain their copied artwork after template deletion. HTML instances reference their template, so an HTML template with existing instances returns a conflict instead of cascading deletion. The server checks ownership under a row lock, then checks dependent instances before deletion in the same transaction. No existing customer template was deleted during verification.

## Reference and scope

TheBrief’s live template picker and the supplied screenshots were inspected on 31 October 2026. Display’s 23 dimensions, Performance Max’s three, Video’s six and Digital’s six choices were observed directly. The source exposed social set counts but not their membership; Social Campaign and Social Posts use explicit XeroFlow selections documented in `app/utils/banner-format-catalog.ts`. This is not a copy of TheBrief’s stock artwork library.

Presentation and Slideshow start a single timeline canvas. This release does not add slide sequencing, transitions or PPTX export. Print choices are pixel canvases, not CMYK/PDF print production. Existing export constraints remain: MP4 requests are limited to ten selected layouts and a maximum dimension of 2000 px; large print/eBook canvases are not eligible for that MP4 path.

For importing existing artwork, see [TheBrief import procedure](thebrief-banner-import.md). A format preset does not import a TheBrief design URL.

## Validation

Implementation began from `origin/main` revision `44682941e4d3268dd685e7c09f117ce942e25d58`. Focused tests cover catalog dimensions, independent artwork/timing copies, client/folder selection, subset creation, failed/ambiguous saves, saving before template capture, ownership and HTML reference protection. The deletion concurrency test verifies query/lock ordering with mocks; it is not a live PostgreSQL concurrency test.

The real Vue page and Nuxt UI controls were checked in a local browser fixture with mock data: all 23 display layouts, selecting a subset, draft creation, the six Digital formats, and modal layout. The fixture does not prove production database writes. Production source and deployment identifiers are recorded separately in the release report.
