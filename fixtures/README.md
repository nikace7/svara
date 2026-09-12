# Synthetic fixtures

Only fictional organisations and content belong here. `authoring.ts` defines the
three guides, 12 approved Himal FAQs, four approved notes, one unapproved/unselected
fee draft, five Himal presentations and a separate Riverside FAQ/presentation.
The original campus map is under `media/`. Setup publishes one complete fixture
release, then creates a current draft with a deliberately missing Nepali greeting.
See `docs/DEMO-CONTENT.md` for provenance, preservation rules and the walkthrough.

`media/himal-campus-map.svg` is original schematic artwork made for Svara from basic
shapes and text. It depicts no real institution and uses no third-party image.
The checked-in PNG is the canonical runtime source; it goes through normal image
inspection before being stored privately. To rasterize the editable source again:

```sh
pnpm --filter @svara/worker exec tsx tools/render-demo-map.ts
```

Rasterization uses the pinned Sharp dependency and an available system font, so
font metrics can vary across machines. Runtime snapshots retain the checksum of
their actual inspected bytes. Editing the fixture source does not rewrite a seeded
release or reimport completed bundles.

No speech audio clips exist yet. The voice lab continues to label its scenarios as
text-only; its PCM test tone does not demonstrate recognition or synthesized speech.
