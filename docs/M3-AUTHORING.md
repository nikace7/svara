# M3 — Bot authoring and publication

M3 is in progress. Persisted bot drafts and bilingual knowledge now have a protected
API and studio editors. Media storage and isolated inspection are implemented;
queue/HTTP/UI integration, presentations and immutable releases remain pending.
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
while retaining its audit record; immutable release preservation will be added
with release snapshots. Audit data contains IDs and actions rather than entry text.

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
- Explicit Save, unsaved indicators, archive/restore and role-aware read-only fields.
- Language switching retains local edits. Conflicting saves preserve local text;
  loading the saved version requires an explicit discard dialog.
- Studio navigation links confirm before discarding unsaved content. Browser reload
  and close use the browser's unsaved-changes warning. No draft text is stored in
  localStorage or sent to speech/generation providers.

## Remaining M3 work

1. Add scoped upload/serving handlers and the studio library to the implemented
   durable media worker and cleanup. See `MEDIA-INSPECTION.md`.
2. Presentations, ordered slides, screen targets and media references.
3. Release readiness checks, immutable preview/published snapshots, idempotent
   publication and release-local search projections.
4. Knowledge query inspection against a pinned release, synthetic bot/content/media
   examples and the complete authoring browser gate.

The existing Voice lab continues to use explicitly labelled synthetic scenarios.
It does not yet preview an authored bot or a persisted release.
