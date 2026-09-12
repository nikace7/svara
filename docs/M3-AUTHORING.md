# M3 — Bot authoring and publication

M3 is in progress. Persisted bot drafts and bilingual knowledge now have a protected
API and studio editors. The media library includes authenticated streaming uploads,
durable inspection, private previews and removal. Presentations now support ordered
bilingual slides, primary/secondary targeting and protected media references.
Immutable release capture, readiness and retrieval now exist in the domain/database
layer; their staff API and studio controls remain pending. See `RELEASES.md`.
Draft tool choices are configuration; they do not execute tools.

## Draft architecture

`BotService` owns draft operations. It uses `IdentityService.asStaff` to resolve the
current session and membership inside the same serializable transaction as each
read or mutation. The client cannot select an organisation by supplying an ID.
Owners and administrators author; operators and viewers inspect. Revoked sessions
fail immediately. Foreign bot IDs return the same not-found response as missing IDs.

Each bot has one draft with a composite bot/organisation foreign key. Creation,
identity changes, draft configuration and archive/restore transitions are audited
atomically. Audit rows store action and target IDs, not persona or bilingual content.
Existing migrations are immutable; follow-up changes use a new migration.

Updates require `expectedRevision`. Missing revisions return HTTP 428. A concurrent
winner increments the revision; stale writers get HTTP 409 `REVISION_CONFLICT` and
`currentRevision`. The serializable retry reruns the revision check. Archived bots
remain readable, leave active lists and reject draft saves until restored.

Strict Zod schemas bound persona, names, descriptions, bilingual strings, allowed
voices and a unique tool allowlist. Incomplete translations can be saved as drafts.
OpenAPI body/response shapes derive from these schemas in a separate server-facing
contracts entrypoint. Bot and knowledge JSON routes accept up to 64 KiB for full Unicode drafts;
authentication and other JSON routes retain their 16 KiB limit.

## Bilingual knowledge

`KnowledgeService` shares the same transactional staff boundary as bot authoring.
Each FAQ or reference note belongs to one scoped bot. Composite foreign keys bind
both its bot and its approving membership to the organisation. Drafts may be
incomplete. Approval requires English and Nepali content, plus both questions for
FAQs. Missing translations return HTTP 422 with actionable `fieldErrors`.

Entry changes require `expectedRevision` and increment both the entry revision and
the parent bot revision in the same transaction. Saving text clears approval;
changing release inclusion preserves it. Approval records the reviewing membership
and time. Archived bots reject entry mutations. Deletion removes the draft entry
while retaining its audit record. Existing releases retain their own immutable
content and retrieval projections. Audit data contains IDs and actions rather than entry text.

Titles are bounded at 160 characters, questions at 500 per language, and content
at 8,000 per language. Reference notes cannot carry FAQ questions. Listing supports
title search, review status, type and pagination, returning completion metadata
without the full entry content. Neither draft authoring nor approval calls an AI
provider or establishes the factual accuracy of the submitted text.

## Studio

- `/studio/bots`: real scoped search, pagination, archived filter and create dialog.
- `/studio/bots/:id`: identity/persona, English/Nepali tabs, voice choices and tools.
- `/studio/bots/:id/knowledge`: entry creation, search, review/type filters and paging.
- `/studio/bots/:id/knowledge/:entryId`: bilingual FAQ/reference editor, translation
  completeness, explicit approval, release inclusion and confirmed deletion.
- `/studio/bots/:id/presentation`: multiple named presentations, selection for the
  bot, slide outline, primary/secondary canvas previews and bilingual properties.
  Reorder by dragging or using Up/Down, then explicitly save the complete order.
  Media selection searches and pages through READY files; private videos stay muted.
- `/studio/bots/:id/releases`: readiness issues linked to draft editors, preview and
  publication confirmation, idempotent retries, paginated history and immutable
  snapshot inspection. Query frozen English/Nepali knowledge without provider calls;
  view saved slides on both screens in landscape or portrait.
- Explicit Save, unsaved indicators, archive/restore and role-aware read-only fields.
- Language switching retains local edits. Conflicting saves preserve local text;
  loading the saved version requires an explicit discard dialog.
- Studio navigation links confirm before discarding unsaved content. Browser reload
  and close use the browser's unsaved-changes warning. No draft text is stored in
  localStorage or sent to speech/generation providers.

## Remaining M3 work

The staff media library and its authenticated streaming API are implemented; see
`MEDIA-INSPECTION.md` for the current processing boundary.

Staff release API and studio readiness, capture, history and pinned knowledge
inspection are implemented; see `RELEASES.md`. The remaining local demonstration
work is reusable synthetic bot/content/media examples. The complete 36-journey
browser gate passed, including retained release media after source draft deletion
and publication retry recovery; see `PROGRESS.md` for the measured checkpoint.

The existing Voice lab continues to use explicitly labelled synthetic scenarios.
It does not yet preview an authored bot or a persisted release.

## Presentation drafts

`PresentationService` uses the same transactional staff authority as other authoring
services. Each bot supports up to 20 presentations of 50 slides. The first created
presentation is selected automatically; creating subsequent presentations preserves
the selection. Selection can be changed or cleared explicitly and is protected by a
composite foreign key that includes both bot and organisation IDs.

Slides carry titles up to 160 characters and text up to 2,000 characters per language,
an optional media ID, a PRIMARY/SECONDARY/BOTH target and a duration of 1–600 seconds.
Drafts may be incomplete. Shared readiness checks require both titles and, when any
body text is supplied, both body translations. These checks describe translation
completeness and are also enforced during release capture.

Every child mutation increments the presentation and root bot revisions. Existing
slide edits and deletion compare the slide revision; appending or reordering compares
the presentation revision; bot selection compares the bot revision. Reordering must
include every current slide ID exactly once. Deletion compacts positions. Moved slides
also advance their revisions. Mutation audits contain action and resource IDs rather
than bilingual text. The creation audit identifies the new slide.

Slide references include the asset's organisation and fixed READY state. The database
rejects foreign or unready attachments and prevents an attached asset from changing
to DELETING. The media API returns 409 `MEDIA_IN_USE` while any slide or saved release
references the asset. The attach-versus-delete race is covered using actual inspected
images; one operation wins, and referenced files remain readable. Release references
also protect the SHA-256 and byte length after draft slides are removed.

The editor owns an explicit saved snapshot and keeps local edits across locale changes,
navigation prompts and conflicts. It never adopts a newer revision to force a stale
save. Save or explicitly discard before switching slides or presentations. Reload
requires confirmation. Archive and inspect-only roles disable authoring controls.
Canvas previews show unsaved text immediately; saving persists it. Long preview text
can be scrolled, and the complete text remains available in the properties fields.
