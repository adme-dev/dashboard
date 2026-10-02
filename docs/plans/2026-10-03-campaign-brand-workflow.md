# Campaign and shared brand workflow

Use the existing Compose and Video Studio forms. XeroFlow Brand Kits are the master for explicitly linked clients; local marketing files remain import/export references.

1. Add an optional Campaign field to Compose. Hydrate existing assignments, clear on client changes and discard stale client requests. Validate campaign ownership on both create and update. Saving a draft must preserve video provenance and must never dispatch it.
2. Add an optional client-owned Brand Kit link to video settings. Read the guide from the kit on reload, preserve the saved local fallback and retain existing model permissions, budgets and manager-only editing. Older requests that omit the new field must preserve an existing link. Reject foreign kits, including kits moved to another client.
3. Test client boundaries, request races, serialization and legacy compatibility. Update public feature descriptions. Review the full diff, apply the additive migration, then ship through the guarded Pages deployment including current main.
4. Verify the News draft's campaign in the live form; link only the DriveAgent and DriveAgent News video profiles to their own kits. Check Planner and QR navigation. Record deployment and screenshots in the marketing handoff. No paid generation or publication is needed for these checks.

Acceptance: a user can attach a manually written or video post to its client campaign in Compose; Banner and Video Studio show the same explicitly linked guide. Changes to the guide do not imply automatic local-file sync or automatic injection into a provider's motion prompt.
