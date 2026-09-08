# M3 — Bot authoring and publication

M3 is in progress. The first increment implements persisted bot drafts, a protected
API and the studio editor. Knowledge, media, presentations and immutable releases
remain pending. Draft tool choices are configuration; they do not execute tools.

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
contracts entrypoint. Bot JSON routes accept up to 64 KiB for a full Unicode draft;
authentication and other JSON routes retain their 16 KiB limit.

## Studio

- `/studio/bots`: real scoped search, pagination, archived filter and create dialog.
- `/studio/bots/:id`: identity/persona, English/Nepali tabs, voice choices and tools.
- Explicit Save, unsaved indicators, archive/restore and role-aware read-only fields.
- Language switching retains local edits. Conflicting saves preserve local text;
  loading the saved version requires an explicit discard dialog.
- Studio navigation links confirm before discarding unsaved content. Browser reload
  and close use the browser's unsaved-changes warning. No draft text is stored in
  localStorage or sent to speech/generation providers.

## Remaining M3 work

1. Bilingual FAQ/reference entries, selection and approval with revision protection.
2. Quarantined media uploads, worker inspection, readiness and safe serving.
3. Presentations, ordered slides, screen targets and media references.
4. Release readiness checks, immutable preview/published snapshots, idempotent
   publication and release-local search projections.
5. Synthetic bot/content/media examples and the complete authoring browser gate.

The existing Voice lab continues to use explicitly labelled synthetic scenarios.
It does not yet preview an authored bot or a persisted release.
