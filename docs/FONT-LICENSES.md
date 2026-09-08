# Font notices

Svara serves font files locally from pinned Fontsource packages. There are no
runtime Google Fonts requests. Fontsource CSS specifies `font-display: swap`.

| Typeface             | Use                   | Package                            |
| -------------------- | --------------------- | ---------------------------------- |
| Space Grotesk        | Headings and wordmark | `@fontsource/space-grotesk`        |
| IBM Plex Sans        | Body and controls     | `@fontsource/ibm-plex-sans`        |
| IBM Plex Mono        | IDs and measurements  | `@fontsource/ibm-plex-mono`        |
| Noto Sans Devanagari | Nepali text           | `@fontsource/noto-sans-devanagari` |

All four fonts use the SIL Open Font License 1.1. Their unmodified notices are
included in `docs/licenses/` and in the installed packages. Preserve these notices
when redistributing the bundled fonts. Nepali sample text is synthetic and still
requires native-speaker review before language acceptance is claimed.
