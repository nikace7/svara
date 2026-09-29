# M7 — Analytics, resilience and operations

M7 makes the running system measurable, recoverable and honest when things fail. See
ADR 028 for where it departs from the blueprint.

## Analytics

`/studio/analytics` and `GET /analytics/overview` and `GET /analytics/latency` report only
what was recorded. Staff with `inspect` permission can read them.

- **One provider mode at a time.** Every query names `live` (the default) or `fixture`.
  Demo results are never mixed with live ones, and the page badge says which is shown.
- **Filters.** Locale (English, Nepali or both) and a window of 1–90 days.
- **Counts.**
  - Conversations by where they happened and how they ended.
  - Questions by outcome, with spoken questions counted separately.
  - Failure and stop codes.
  - Tool calls by status.
  - Audited changes by action. These are counts only, never who or what.
- **Timing distributions** for five stages:
  - speech recognised;
  - first answer text;
  - first spoken audio;
  - whole answer;
  - a kiosk acknowledging a slide.

  Turn stages are measured on the API's monotonic clock from the moment the question
  arrives. Slide acknowledgement uses the command's own sent and acknowledged times,
  both server clocks.

- **Percentiles.** They use `percentile_disc`, so each is a value that was actually
  measured. Below five samples they are withheld: the page says "Insufficient: n of 5
  samples", or "Unavailable: nothing measured" when there are none. `missing` counts turns
  that should have recorded a stage but did not, such as speech that never started. A
  missing value is therefore never shown as zero.

## Retention

The worker applies retention at startup and hourly. See `OPERATIONS.md` for the full
schedule. Transcripts go 30 days after a conversation ends, through the same helper staff
deletion uses. States, timings and counts stay, so analytics remain correct after expiry.
Spent credentials are deleted seven days after they expire, once nothing references them.

## Backup, restore and reset

- `pnpm backup [--compose]` writes a checksummed dump, the media and exact per-table row
  counts. A database that changes during the dump is refused.
- `pnpm restore <dir> [svara_restore_*]` only creates a new database and media directory,
  then verifies checksum, marker, every table and every stored media file.
- `pnpm demo:reset svara_dev` requires the typed database name, the marked local demo
  database and a `.local/media` root. It backs up first.

`OPERATIONS.md` holds the runbooks: swapping a restore into use, the Compose equivalents,
shutdown, and a configuration reference.

## Failure behaviour

| Failure                          | What the visitor or staff member sees                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Microphone refused               | "Microphone permission was denied. Type the question instead." in the conversation's language; typing works                |
| Autoplay refused / audio blocked | The answer text continues; after two seconds without audio output the answer notes the audio could not play                |
| Provider quota or outage         | The named failure in the conversation's language; the same conversation answers again once the provider does               |
| Connection dropped               | "The connection dropped mid-answer"; Reconnect restores the finished answers into a new session                            |
| Kiosk offline                    | Shown at once from the browser's offline event; the last complete release stays; answers pause and resume when back online |
| Release download fails           | The complete release stays on screen and the command reports `DOWNLOAD_FAILED` (M4 gate)                                   |

Two defects were found and fixed while building these journeys:

- **Autoplay.** A blocked `AudioContext.resume()` never settles, so the panel waited on
  the first audio packet and stopped showing text. The test fails against the previous
  code.
- **Offline detection.** Kiosks only noticed a lost network when the socket ping timed
  out, which could take 45 seconds.

## Layout and language

- A browser journey loads the playground, sessions, analytics and a Nepali public link
  at 360, 768 and 1440 pixels. At each width it checks for horizontal overflow and
  accessibility violations, and saves screenshots to `artifacts/screenshots/m7-*`.
- It also asks a Nepali question from the keyboard alone.
- Small uppercase labels no longer letter-space Devanagari, which had split conjuncts
  such as "सहायक".
- Conversation failure messages are now localised.
- The studio sidebar now shows the real provider mode instead of always "Fixture mode".

## Evidence

- **Integration** (`conversations.test.ts`):
  - retention blanks only expired transcripts, keeps counts and timings, audits once, and
    deletes only unreferenced expired pairing codes;
  - analytics counts match direct queries, percentiles match the recorded values, typed
    questions report recognition as unavailable, invalid modes and windows are refused,
    and audit counts are independent of mode;
  - HTTP routes are covered in `conversations-http.test.ts`.
- **Unit** (`safety.test.ts`): restore and reset targets are refused unless they are
  exactly the intended local names and paths.
- **Browser** (`conversations.spec.ts`): analytics mode separation, microphone refusal and
  blocked audio in English and Nepali, quota and reconnect, kiosk offline, and
  three-width layouts with a keyboard-only Nepali question.
- **Manual:**
  - The running demo database was backed up (18 tables, 2,439 rows, 41 media files) and
    restored into `svara_restore_m7check`, which verified.
  - The reset ran against a throwaway PostgreSQL container: the edited data was gone, the
    demo was reseeded, and the pre-reset backup restored and verified.

## Not built, or not yet proven

- **The `/operations` socket.** The studio polls canonical HTTP data instead; see ADR 028.
- **Hands-free barge-in and display subtitles** remain from M6.
- **The Compose demo stack on port 4320** still runs the M3-era build from the main
  checkout. Its database has not been migrated, and the reset runbook for Compose
  volumes has not been executed.
- **Native-speaker review.** The new Nepali copy (failure messages) needs it, like the
  M6 visitor copy.
- **Real-key evidence** for live timings. Every live measurement here comes from the stub
  provider stack.
