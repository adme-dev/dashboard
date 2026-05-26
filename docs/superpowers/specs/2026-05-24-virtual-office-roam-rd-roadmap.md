# Virtual Office Roam R&D Gap Analysis

**Date:** 2026-05-24
**References:** https://ro.am/virtual-office, https://ro.am/drop-in-meetings, https://ro.am/ainbox, https://ro.am/lobby, https://ro.am/video-conferencing, https://ro.am/screen-recorder, https://ro.am/ai-note-taker, https://ro.am/on-it, https://ro.am/on-air, https://ro.am/mobile, https://ro.am/pricing
**Status:** Draft research notes for the dashboard virtual office

## Product Direction

Roam is not just a video-room directory. The core product is a persistent company map where people, rooms, conversations, and work signals all have a visible location. Lobby extends that map outward: public/private booking links become real doors into the office, not isolated calendar links.

The internal office emotional loop is:

1. See where everyone is.
2. Understand what is happening without interrupting.
3. Drop in with a lightweight social gesture.
4. Move from presence to audio/video/chat when needed.
5. Leave behind searchable work artifacts.

The external Lobby loop is:

1. Share a memorable branded link.
2. Let guests book later or drop in now if someone is free.
3. Route the guest to the right host, room, reception, or private office.
4. Collect enough context before the meeting starts.
5. Keep the guest in a branded waiting-room experience instead of a generic scheduler.

The video/meeting loop is:

1. Start from presence, lobby, or calendar.
2. Let internal users knock or drop in without generating a link.
3. Let external guests join from a browser without an account or install.
4. Escalate from audio-only to video, screen share, notes, and action items.
5. Save the meeting context back into chat, CRM/project work, and AI follow-up.

The async memory loop is:

1. Record a screen walkthrough instead of scheduling a meeting.
2. Share it into the same workspace where live rooms and chat already exist.
3. Generate transcript, summary, chapters, and viewer activity.
4. Capture live meetings and spontaneous drop-ins the same way.
5. Turn decisions and commitments into tasks, CRM updates, and AI follow-through.

The messaging and AI loop is:

1. Every person, room, meeting, recording, and artifact has a thread.
2. Search and prompt across chats, PDFs, meetings, recordings, and office state.
3. Let the AI assistant observe office state and create watches/reminders.
4. Let the assistant schedule, follow up, email, and post back into threads.
5. Keep execution visible as status updates, not hidden background magic.

Our current `/office` build has the right foundation: a dark floor plan, rooms, desk zones, membership, WebSocket presence, and status. The next development should make the map feel alive and actionable before spending all effort on media.

## Roam Feature Inventory

Observed product concepts from Roam's public virtual office page:

- Company HQ map with private offices, meeting rooms, theater, game room, shelves, and side apps.
- Private office per person as an audio-first home base, including a personal shelf.
- Click seat/room to enter, and visibly move location on the map.
- Talking indicators on avatars/heads.
- "Knock" before entering private spaces.
- Wave/chat interactions directly from a person's avatar.
- Do Not Disturb status, including integrations that auto-detect Zoom or Google Meet calls.
- Meeting rooms with video, screen sharing, whiteboard, minutes, and reactions.
- Theater/all-hands room for large events.
- 3D/chat visualization on the map, including typing indicators.
- Stories/async short video updates.
- Game room with multiplayer games and leaderboard.
- GitHub/Figma/Spotify/Apple Music style work and personality signals displayed next to people/offices.
- Out-of-office/will-return states.
- Map editor: seating, logo, colors, room resizing, floors.
- Spotlight search to find people on the map.
- Elevator/multi-floor navigation.
- Physical-office tags for hybrid locations.
- Recordings searchable by room/date/moments.
- Calendar scheduling from map/chat.
- AI agents with offices that can be chatted with, knocked on, or spoken to.

## Roam Drop-In Meetings Inventory

Observed product concepts from Roam's public Drop-In Meetings page:

- Knock, talk, done: the default meeting should be a short, lightweight interaction.
- Private offices are audio-first and require knocking.
- Video rooms are fully featured but still live on the same map.
- A visible "knocking on someone's door" state can be cancelled.
- Rooms can be locked to prevent drop-ins.
- People should be able to give someone "the boot" from their office.
- Meeting presence appears on the HQ map so colleagues understand what is happening.
- External meetings can be scheduled through Google Calendar or O365 and use Roam as the meeting destination.
- Meeting-room controls include screenshare with sound, raised hands, background blur/virtual background, face touch-up, noise cancellation, whiteboard, and Magic Minutes.

## Roam AInbox Inventory

Observed product concepts from Roam's public AInbox page:

- Messaging is the container for the rest of the office, not a side feature.
- AInbox supports direct messages, group chats, confidential chats, threads, replies, meetings folders, custom folders, pinned/bookmarked chats, scheduled messages, and drag-and-drop ordering.
- Meeting chats are first-class. Meeting threads sit alongside DMs and groups.
- Guest badges allow external people to chat and visit without paid seats.
- Search spans chats and meetings with keyword/date/channel filters.
- AI search and AI-promptable threads let users ask questions of long threads.
- PDFs uploaded into chat become promptable.
- Activity view provides a chronological inbox mode for people who prefer a traditional inbox.
- Integrations include Zapier/developer API, plus native GitHub and Spotify signals.
- Compliance matters: messaging archive/compliance integrations are part of the enterprise story.

## Roam Lobby Feature Inventory

Observed product concepts from Roam's public Lobby page:

- Personal Lobby links such as `ro.am/howard`.
- Branded meeting scheduler plus immediate "Drop-In Now" call to action.
- Configurable event duration, timezone, office destination, and availability slots.
- Minimal and skeuomorphic lobby design modes.
- Custom handle / short URL instead of a long scheduling link.
- Scheduling rules: buffers, minimum notice, daily caps, and custom availability windows.
- Automatic availability: lobby flips to available when the host is free.
- Separate lobbies for sales, support, hiring, VIPs, or office hours.
- Design controls: logo, background color, texture, verification badge.
- Custom pre-booking form fields for qualification/context.
- Guest destination routing to private office, video room, or shared reception.
- Multiple required hosts where only mutually free slots are shown.
- Round-robin host pools for sales/support/recruiting.
- Embeddable lobby/drop-in button for external websites.
- Company-wide lobby links sharing availability across a team.
- Virtual shelf in the waiting room for awards, photos, press, and product moments.

## Roam Video and Guest Experience Inventory

Observed product concepts from Roam's public video conferencing guide:

- Presence-based meetings instead of link-first meetings.
- Audio-only knock/drop-in as the default lightweight interaction.
- Video and screen sharing as escalation, not the starting point.
- Short internal conversations as a product goal; Roam repeatedly positions average meetings around minutes rather than calendar blocks.
- Browser-based guest access with no account or installation required.
- Scheduled external meetings still supported through Lobby, but booked meetings land in Roam rooms.
- External meetings matter most for sales, customer success, agencies, and professional services.
- Guest experience is a differentiator: reduce setup friction before the call starts.
- Native AI notes and summaries without an obvious bot participant.
- Notes should flow into the participant group chat/thread after the meeting.
- Action items should be executable by an AI agent or assigned into the work system.
- Meeting artifacts should connect to scheduling, chat, screen recording, events, and office presence.
- Traditional video features are still table stakes: HD audio/video, screen sharing, recording, captions/transcription, chat, scheduling integration, and guest access.
- Compliance/admin controls still matter for external calls: encryption, meeting permissions, participant access, and auditability.

## Roam Screen Recorder Inventory

Observed product concepts from Roam's public screen recorder guide:

- Async video is part of the same communication stack, not a separate Loom-style island.
- Recording should be available from inside the workspace without a separate extension or download.
- Core recording modes: screen, selected area/window, webcam overlay, narration, and background blur.
- Recording completion should immediately produce a shareable link.
- Recordings need transcripts, AI summaries, chapters/highlights, and searchable text.
- Viewer analytics matter: named internal viewers, percent watched, replay data, and external link view data.
- Password-protected external links matter for sensitive recordings.
- Async recordings should flow naturally into chat, meetings, project/customer context, and follow-up.
- Customer-success and sales use cases need follow-up videos, onboarding walkthroughs, and potentially CRM-linked view activity.
- Engineering use cases include bug reports, pull request walkthroughs, design feedback, and async product demos.
- Longer training/product walkthroughs need generous recording limits and durable storage.

## Roam AI Note Taker Inventory

Observed product concepts from Roam's public AI note taker guide:

- Meeting notes should become action, not just transcripts.
- Bot-free capture is a major positioning point for sensitive calls.
- Drop-in and unscheduled meetings must be capturable; calendar-only note taking misses the key virtual-office interaction.
- Meeting output includes speaker-attributed transcript, structured summary, decisions, questions, and action items.
- Summary templates should vary by meeting type: sales calls, standups, all-hands, interviews, client reviews.
- Notes should automatically create or attach to a participant group chat/thread.
- Users should be able to ask questions of a meeting transcript after the call.
- Cross-meeting intelligence matters: search and query across old meetings, not only one call.
- CRM linking/sync matters for sales and customer success; automatic lead/deal matching is valuable.
- AI follow-through is the differentiator: action items should flow to tasks, emails, scheduling, project tools, or an AI agent.
- Consent, data retention, deletion, and model-training controls are product requirements, not later polish.
- Language support and transcription accuracy need to be considered early.

## Roam On-It Inventory

Observed product concepts from Roam's public On-It page:

- The AI assistant is office-aware: it can see who is present, where people are, who is meeting, and when people free up.
- On-It lives in AInbox like another conversation.
- It can set watches, such as notifying a user when two people enter the same meeting.
- It can schedule meetings with internal and external people.
- It can follow up through chat and email.
- It can volunteer for action items generated by Magic Minutes.
- It can pull context from past meeting transcripts, chats, PDFs, and Magicasts.
- It can post follow-up summaries back into the meeting chat.
- It supports individual knowledge and company knowledge uploads.
- Execution status is visible through task/substatus updates.
- Each person effectively gets an executive assistant, while admins can provide shared company knowledge.

## Roam On-Air / Events Inventory

Observed product concepts from Roam's public On-Air and virtual events pages:

- Events are part of the office, not separate webinar infrastructure.
- Event creation includes RSVP pages, friendly URLs, colors, date, and description.
- Guest invites can be sent by email or SMS, with tailored sender/message.
- Press/social kits generate assets for Instagram, TikTok, X, and LinkedIn.
- Host tools include attendee blasts, guest search/download, RSVP/show-up tracking, and follow-up lists.
- Events appear on the office map to create energy and visibility.
- Theater mode includes stage, curtain, backstage, producer chat, audience rows, whispering, Q&A/raised hands, reactions, and presenter handoff.
- Stadium mode splits very large audiences into floors and supports thousands of attendees.
- Dedicated event platforms may still be needed for ticketing, sponsorship, expo booths, or complex monetized conferences.

## Roam Mobile Inventory

Observed product concepts from Roam's public Mobile page:

- Mobile is not a companion inbox only; it includes the map, AInbox, theater, Magic Minutes, stories, On-It, and presence.
- Mobile map supports pinch/zoom, floor switching, and room drop-ins.
- Lock-screen/live view keeps office state visible without opening the app.
- Mobile presence should show who is there, who is meeting, and who will return when.
- Mobile supports guest badges, stories, Magic Minutes prompts, and On-It commands.
- Apple Watch and CarPlay are treated as additional presence/audio surfaces.
- Stories are short-form pictures/videos that last 24 hours.

## Pricing and Packaging Inventory

Observed product concepts from Roam's public pricing page:

- Roam positions the product as one integrated "9 for 1" bundle.
- Billing is per active member, monthly, with no annual commitment.
- External guests are free.
- The bundle argument is part of the product: one identity, one vendor, one security review, one office.
- Pricing reinforces roadmap sequencing: isolated tools are less compelling than integrated surfaces that share identity, threads, artifacts, and AI context.

## Current App Gap

Already present or partly present:

- Office route inside the agency SPA shell.
- Membership-gated office access.
- Multi-office data model.
- Live presence through the OfficeRoom WebSocket worker.
- Status picker.
- Floor plan with lobby, meeting rooms, focus rooms, and desks.
- Dev self-heal for office membership.
- Desk owner/avatar rendering.

High-impact gaps:

- No person action menu on avatar/desk.
- No search to find a person, room, or desk.
- No room detail panel.
- No first-class private office experience beyond desk cards.
- No talking/typing/knocking transient state.
- No media panel yet.
- No admin map editor.
- No work-signal integrations surfaced on the office map.
- No AI agent concept.
- No multi-floor navigation.
- No external lobby/scheduler concept.
- No guest routing from a public link into an office room.
- No intake form attached to office meetings.
- No branded waiting room or virtual shelf.
- No browser guest join flow for external meetings.
- No meeting artifact model for notes, summaries, recordings, or action items.
- No clear split between internal drop-ins and external scheduled meetings.
- No async screen recording model.
- No recording library, share links, viewer analytics, or password protection.
- No transcript/summary template model.
- No consent/retention controls for meeting capture.
- No CRM/project sync target for meeting notes or recordings.
- No AInbox-style unified thread model for DMs, groups, meetings, recordings, artifacts, and guests.
- No guest badge model spanning chat, office access, lobbies, and meetings.
- No AI assistant job/watch model.
- No event/theater model for all-hands, webinars, RSVP, backstage, or audience interaction.
- No mobile/push/live-view strategy.
- No packaging/entitlement model around active members versus free guests.

## Recommended Roadmap

### Milestone 1: Make Presence Actionable

Goal: the office should feel useful even before video works.

- Add spotlight search for people, desks, and rooms.
- Add avatar/desk action menu: wave, knock, message, view profile.
- Add transient presence events: waving, knocking, typing, talking.
- Add selected person/room side panel.
- Add "my location" affordance and leave-room control.
- Add better empty and loading states for offices/rooms.

Acceptance:

- A user can find Paul by name, focus his desk, and open actions.
- Clicking a room opens a panel instead of only sending a WebSocket event.
- A knock/wave renders on the target user's desk/room for a short duration.

### Milestone 2: Private Offices

Goal: every team member has a recognizable home base.

- Treat `desk` zones as "private offices" in UI copy and behavior.
- Show owner avatar, status, current room, and personal shelf placeholders.
- Add owner-specific signals: current status, will-return text, active app/in-call badge.
- Let the owner enter their own office directly from status/header.
- Add admin seed/update script to keep desks aligned with office members.

Acceptance:

- Desks no longer look like anonymous workstation tiles.
- A person's office remains identifiable even when they are away.

### Milestone 3: AInbox Thread Foundation

Goal: create the thread layer that meetings, recordings, guests, AI, and projects can all write into.

- Normalize DMs, group chats, meeting chats, room chats, guest chats, and artifact threads.
- Add folders/pins/bookmarks and a chronological activity view.
- Add guest badge access for limited external chat and office/lobby participation.
- Add promptable thread metadata and attachment indexing hooks.
- Add confidential/retention flags before expanding guest and recording features.

Acceptance:

- A room, meeting, recording, and external guest can each have a durable thread.
- Meeting and artifact output has a natural destination before AI summaries are implemented.

### Milestone 4: Room Panel and Media Readiness

Goal: prepare the interface for Cloudflare Realtime without blocking on credentials.

- Add `OfficeRoomPanel.client.vue` for selected room.
- Include participants, capacity, join/leave, mic/cam placeholders, notes/chat tabs.
- Add device permission states and a "lurking" mode.
- Wire existing `zone:enter` and `zone:leave` to the panel.
- Add knock, lock room, raised hand, boot participant, and cancel-knock states.
- Keep the Cloudflare Realtime integration behind a composable boundary.

Acceptance:

- Room panel works in presence-only mode.
- Media can be plugged in without redesigning the page.

### Milestone 5: Cloudflare Realtime Media

Goal: audio/video/screenshare inside rooms.

- Complete a one-day Cloudflare Realtime spike using the current HTTPS session/track API.
- Implement server-side Realtime client and token/session minting.
- Add media controls, tiles, screenshare, permission handling, and teardown.
- Support audio-only knocks/drop-ins before camera join.
- Support browser guest join without a dashboard account.
- Separate internal drop-in rooms from scheduled external meetings.
- Add quota/ICE/device error handling.

Dependency:

- Cloudflare Realtime app id/secret or an account where the app can be provisioned.

### Milestone 6: Admin Map Editor

Goal: admins can shape the office without SQL.

- Add admin mode inside `/office`.
- Drag/resize zones.
- Create room, private office, theater, client lounge, and desk zones.
- Edit zone name, capacity, privacy, and ACL.
- Save with existing zone APIs.

Acceptance:

- A super admin can create a new room and move desks from the UI.

### Milestone 7: Lobby and External Guest Entry

Goal: turn scheduling links into branded doors into the virtual office.

- Add a `lobbies` model linked to users, teams, and offices.
- Support personal handles such as `/l/:handle` or company-scoped links.
- Add booking slots from connected calendar availability.
- Add "Drop in now" when a host/round-robin pool is available.
- Add guest intake form fields per lobby.
- Route guests to private office, reception, or a specific meeting room.
- Add waiting-room page with company shelf items and meeting context.
- Add embed snippet/button for external sites.
- Add external guest permissions, expiry, and audit trail.
- Add pre-join experience: name/email, device check, host availability, waiting state.

Acceptance:

- A guest can open a public lobby, either book a time or request a live drop-in, and land in a controlled office destination.
- Admins can create separate lobbies for sales, support, hiring, and VIP flows.
- Guests can join from the browser without a dashboard account.

### Milestone 8: Meeting Artifacts and Follow-Up

Goal: make external and internal meetings produce useful work output.

- Add meeting session records linked to office zone, lobby, hosts, guests, scheduled event, and recording artifacts.
- Add post-meeting transcript/summary/action-item placeholders.
- Add configurable summary templates by meeting type.
- Add explicit consent, retention, deletion, and access controls.
- Send notes into the relevant chat thread or project/customer timeline.
- Add CRM/project hooks for sales, customer success, and agency client meetings.
- Add AI follow-up queue for action items once the AI agent surface is ready.

Acceptance:

- A scheduled external meeting creates a durable record with participants, source lobby, room, and follow-up status.
- Meeting output has a destination in the app instead of disappearing after the call.

### Milestone 9: Async Screen Recording

Goal: add a Loom-style async communication path that lives inside the office stack.

- Add `recordings` and `recording_views` models.
- Add browser screen/webcam recording UI where supported.
- Add upload/storage path for recorded assets and generated thumbnails.
- Add share links with public/private/password-protected access modes.
- Add transcript/summary placeholders using the same artifact pipeline as meetings.
- Add named internal viewer analytics and basic external view analytics.
- Add attach/share actions for chat, projects, clients, tasks, and meetings.

Acceptance:

- A user can record a screen walkthrough, share it to a teammate/client, and see whether internal viewers watched it.
- Recordings use the same artifact/summary/search model as meeting captures.

### Milestone 10: Office-Aware AI Assistant

Goal: make AI execution visible, contextual, and tied to office state.

- Add an AI assistant conversation in AInbox.
- Add watch jobs for presence events, room co-presence, meeting ended, and person available.
- Add assistant jobs for schedule meeting, send follow-up, email guest/client, summarize thread, and collect status.
- Add personal and company knowledge sources.
- Add execution status/substatus events so users can see what the assistant is doing.
- Add approval gates for external email, calendar changes, and client-facing actions.

Acceptance:

- A user can ask the assistant to watch for two people meeting and notify them.
- Action items from a meeting can become assistant jobs with visible status and approval.

Operational cron:

- Endpoint: `POST /api/cron/office-assistant`
- Header: `x-cron-secret: <CRON_SECRET>`
- Suggested schedule: `*/5 * * * *`
- Debounce: active watches are only eligible when `last_triggered_at` is null or older than 15 minutes.
- Cloudflare Pages cron triggers must be configured in the dashboard; `wrangler.toml` documents the target because Pages projects do not support committed `[triggers]`.

### Milestone 11: Events and Theater

Goal: support all-hands, webinars, launches, and customer/community events inside the office.

- Add event model with RSVP page, friendly URL, date, description, host/team, and office theater destination.
- Add email/SMS invite and attendee blast scaffolding.
- Add attendee list, RSVP/show-up status, export, and follow-up state.
- Add theater mode with stage, backstage, audience rows, whispering, raised hands/Q&A, reactions, and producer chat.
- Add event artifacts: recording, transcript, summary, chat, attendee follow-up.

Acceptance:

- An admin can create an internal all-hands or external webinar-style event and route attendees into a theater experience.

### Milestone 12: Mobile and Push Strategy

Goal: make the office usable when people are away from desktop.

- Add responsive/mobile map constraints first; native app can come later.
- Add push-notification model for knocks, lobby guests, mentions, assistant jobs, and event reminders.
- Add live-view/presence summary API for mobile widgets or future native clients.
- Add stories/short updates only after core presence, messaging, and artifacts are stable.

Acceptance:

- Mobile users can see office state, respond to knocks/messages, join audio, and manage availability without desktop.

### Milestone 13: Packaging, Entitlements, and Admin Controls

Goal: keep the bundle coherent and avoid later permission rewrites.

- Add active-member versus guest entitlement model.
- Add feature flags for office, lobby, media, recordings, AI, events, and guest access.
- Add workspace admin controls for retention, recording consent, external links, guest badges, and audit logs.
- Add integration priority list: Google/O365 calendar, HubSpot/CRM, Slack import/bridge, GitHub, Figma, Xero/Monday where relevant.

Acceptance:

- Free guest access, paid active members, and admin security controls are represented in the data model before public lobby/media launch.

Operational retention cron:

- Endpoint: `POST /api/cron/office-retention`
- Header: `x-cron-secret: <CRON_SECRET>`
- Suggested schedule: `35 3 * * *`
- Behavior: archives expired recordings and revokes share links; deletes expired ended/cancelled meeting sessions so dependent artifacts cascade.

### Milestone 14: Work Signals and Integrations

Goal: make the office map a live operating surface.

- Add external signal badges for GitHub/Figma/calendar/active meeting states.
- Add AI agent occupants/offices using the existing agency AI surface.
- Add quick actions from a room/person to create task, brief, meeting, or follow-up.
- Add meeting notes/summaries after media is stable.

## Near-Term Build Order

1. Implement spotlight search and focus navigation.
2. Add person/desk action menu with knock, wave, message, profile.
3. Add AInbox thread foundation for room/meeting/artifact/guest threads.
4. Add room side panel in presence-only mode.
5. Add private-office polish and personal shelf placeholders.
6. Add lobby data model and internal admin CRUD.
7. Add guest badge and pre-join/waiting-room flow.
8. Add entitlement/admin-control scaffolding for guests, recording, and retention.
9. Then continue Phase 1b media.
10. Add meeting artifact records, consent, and summary templates before AI summaries.
11. Add AI assistant watch/job model.
12. Add async recording once artifact storage/search exists.
13. Defer events/theater and native mobile until the core loop is stable.

This order reduces risk: the product becomes Roam-like and dogfoodable before the hardest WebRTC work lands.
