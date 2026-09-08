# Media storage and inspection

The media foundation is implemented and tested independently of the studio.
Queue reconciliation, expiry/deletion jobs, HTTP upload/serving handlers and the
media library UI are still pending. The running worker currently performs health
checks and a heartbeat; it does not yet claim or complete media jobs.

## Admission and storage

`MediaService` resolves current staff authority and organisation inside the shared
transaction boundary. Owners/admins reserve and upload; all staff can inspect
scoped metadata. Foreign IDs return not found. The client supplies no storage key,
organisation, lease or inspection state. Reservations enforce a 250-asset limit,
512 MiB of declared source bytes and four pending uploads per organisation.
Processed copies and thumbnails add storage beyond the source-byte quota.

Uploads stream into an exclusive private `.part` file with exact byte counting and
SHA-256. A complete file is linked into quarantine, then staff authority and the
receiving lease are rechecked before recording QUARANTINED. Revocation during an
upload rejects its completion. Lost commit acknowledgement does not delete bytes
that a successful database commit already accepted. No quarantined URL is exposed.

Only generated UUID keys are accepted under the canonical private media root;
display filenames never become paths. Reads reject non-regular files and extra
hard links, and use no-follow flags where available. File responses require READY
metadata. Revision checks protect deletion requests; worker cleanup remains pending.

Migrations 007 and 008 add scoped media rows, READY/lease/rejection constraints,
SYSTEM audit actors and a forward correction to a foreign-key constraint name.
Applied migrations remain immutable.

## Inspection

The inspector verifies source size and checksum, checks the file signature, then
uses unique output keys containing the asset and inspection lease IDs. Existing
outputs are never overwritten. On failure it removes only outputs it created.
The future job coordinator must commit READY conditionally against the same lease;
returning an inspection result alone does not alter the database.

JPEG/PNG inputs have a 10 MiB and 25-megapixel limit. A separate Node/Sharp process
limits input channels, applies orientation, converts to sRGB, re-encodes the image
without source metadata, and generates a PNG thumbnail no larger than 480 × 480.
Processed images stay within 10 MiB; thumbnails stay within 2 MiB. Multi-page and
malformed images are rejected. Both stored outputs receive independent checksums.

MP4 inputs have a 50 MiB limit. Only one H.264 video track in an 8-bit 4:2:0 pixel
format and an optional AAC track are accepted. Dimensions are at most 1920 × 1080;
format and track durations must all be finite, positive and at most 120 seconds.
Auxiliary tracks and unsupported codecs are rejected. Accepted video bytes remain
unchanged, with a second checksum comparison after copying. There is no transcoder.

Subprocesses have no shell, inherit only selected operating-system settings, and
have bounded stdout/stderr and a 15-second wall-clock inspection deadline. The
supervisor waits for termination on timeout. Parser diagnostics never become
user-facing error strings or application logs. Rejections use shared stable codes.

## Linux ffprobe isolation

The common image builds `infra/media-sandbox.c` with compiler warnings as errors,
stack protection and linker hardening. The unprivileged helper uses Landlock ABI 3
or newer to allow the selected input inode, ffprobe, its ELF loader and runtime
libraries. It denies other file reads and all filesystem writes. Seccomp denies
network/socket operations, process creation, cross-process access and selected
kernel interfaces. Threads retain the restrictions. The helper closes inherited
extra descriptors, clears the environment and applies CPU, address-space, file-size
and descriptor limits. Unsupported isolation exits with `INSPECTION_UNAVAILABLE`.

ffprobe is forced to the MOV demuxer and local-file protocol, with external data
references and absolute external paths disabled. The Compose worker additionally
drops all capabilities, enables no-new-privileges and limits memory, CPU and PIDs.
Image decoding has its separate process and pixel/channel limits; the
Landlock/seccomp policy applies to ffprobe.

The runtime regression proves unrelated reads, input writes, sockets and process
creation fail, then inspects a generated H.264 clip. This caught an initial missing
execute permission on the ELF loader, fixed by granting only the loader paths for
the supported Linux architectures. No broad filesystem permission was added.

References: [Landlock](https://docs.kernel.org/userspace-api/landlock.html),
[ffprobe](https://ffmpeg.org/ffprobe.html),
[MOV demuxer options](https://ffmpeg.org/ffmpeg-formats.html#Options-9),
[Sharp input limits](https://sharp.pixelplumbing.com/api-constructor/).

## Native development

Compose supplies FFmpeg and the sandbox. For native integration tests, install
FFmpeg and set these entries in the existing ignored `.env`, preserving its keys:

```dotenv
MEDIA_INSPECTION_MODE=native
FFPROBE_PATH=ffprobe
```

Use an absolute `FFPROBE_PATH` if the binary is outside the current process PATH.
On this Windows workspace FFmpeg 9.0.1 was installed with WinGet package
`Gyan.FFmpeg`; the configured ffprobe path is under the user's WinGet Links folder.
The native mode has process/format limits but does not provide Linux filesystem
isolation. Configuration rejects native inspection in production. The default is
`sandboxed`; there is no automatic fallback to native mode.

`pnpm test:integration` builds the inspector child before running real-file tests.
`pnpm test:media:sandbox` verifies the built image under network, privilege, memory
and PID restrictions. CI runs native tests with an explicit per-step setting and
the production-container tests with sandboxed inspection.
