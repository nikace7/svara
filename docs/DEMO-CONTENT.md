# Fictional authoring demo

The seed installs a reusable example through the real database, image inspector,
release capture and search projection. It uses no external provider. All rooms,
programmes, opening hours and event times are synthetic and labelled accordingly.
The Nepali text is supplied as demo content; independent human language review is
still part of the later bilingual evaluation gate.

## Inventory

| Workspace           | Content                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Himal               | Campus Admissions Guide and Campus Event Host                                                                                  |
| Himal knowledge     | 12 approved bilingual FAQs, four approved bilingual notes, one unapproved and unselected fee draft                             |
| Himal presentations | Welcome, Admissions steps, Office hours, Room map, Open-house schedule                                                         |
| Himal release       | Admissions version 1 with complete configuration, 13 selected entries, two ordered slides and an inspected original campus map |
| Himal current draft | Revision 2 deliberately lacks the Nepali greeting; the published version retains it                                            |
| Riverside           | Separate Exhibition Guide, one bilingual help-desk FAQ and a welcome presentation                                              |

The event host's example timetable has 13:00 welcome, 13:30 tour and 14:00 questions.
It does not create a dated event, deployment or device state. Those fixtures arrive
with their actual features; no illustrative October 2026 date is used here.

## Walkthrough

1. Run the documented setup and `pnpm demo:up`. Use the generated Himal owner
   credentials from `.local/setup/demo-staff.json`; do not commit or share the file.
2. Open Bots → Campus Admissions Guide → Releases. The readiness issue points to
   the missing Nepali greeting. Version 1 is still complete and immutable.
3. Select Version 1. Query English “Where is the admissions office?” or Nepali
   “भर्ना कार्यालय कहाँ छ?” to retrieve the selected room 12 passage.
4. Query “tuition fee”. No approved passage supplies that detail, so the inspector
   displays the saved fallback. The fee draft is visible in Knowledge but excluded
   from the release.
5. Select Nepali content and the second saved slide. The secondary screen shows the
   private campus map; the primary screen correctly omits that slide. Try portrait
   orientation, then return to the draft Presentation editor to inspect other decks.
6. To exercise authoring, fill the draft's Nepali greeting and save explicitly. Recheck
   readiness and publish version 2. Version 1 continues to reproduce its original
   content. These are local edits; setup will preserve them on subsequent runs.
7. Sign in with the Riverside owner in a separate browser context. Its guide and
   content belong to a different workspace; Himal resource IDs return 404 there.

The release inspector shows retrieved text rather than a generated conversation.
In live mode the Voice lab grounds typed questions in a release chosen from this same
list, so Version 1 answers from the room 12 passage; fixture mode keeps its scripted
scenarios. Device pairing, scheduled deployments and public sessions are later steps.

## Additive seed and recovery

The CLI first validates the local `svara_dev` target and application marker. It
preserves existing staff credentials and roles. A new authoring bundle requires an
enabled owner/administrator in the intended organisation; seeding mints no session
or bypass credential. Fixture approvals reference that seeded author and audits
identify the provisioning as LOCAL, not a human review of real admissions policy.

Each organisation's bundle uses one transaction and an advisory lock. Content,
publication, search/media references and an ApplicationMetadata receipt
`local-authoring:v1:<organisation-id>` commit together. A completed receipt makes
reruns a no-op, even after edits, archives or child deletion. A preexisting bot ID
without its receipt is refused rather than adopted. Do not remove receipts to force
a reseed; use normal authoring controls to change content.

Image inputs undergo the normal inspector and shared output/checksum verification.
Only verified READY metadata is committed. The fixture checks existing media count
and byte quotas. A failed transaction leaves no partial content bundle; cleanup
checks database references before deleting generated files, protecting outputs if a
commit acknowledgement was lost. If the database cannot be read, files remain for
normal orphan reconciliation. Read-only historical snapshots are never rewritten.

The source SVG and canonical PNG in `fixtures/media/` are original fictional
schematic artwork with no external image source. Only the inspected PNG enters
private media storage. The display filename never becomes a filesystem path.

Native setup uses its configured media root. Full Compose setup uses the shared
media volume; do not seed the running Compose database from a native process with
a different media root. Both modes share the development database, and switching
modes does not transfer existing files. Keep an existing demo in its original mode
unless its media files have also been transferred; reseeding does not repair a
different or missing media store. CI creates authoring examples only when launching
the full Compose stack, so the browser checks use the same media volume as the seed.
