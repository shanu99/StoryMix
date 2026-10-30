# StoryMix Phase 1 — audit and acceptance evidence

## Protected baseline
- Production: `main`; no file modifications or deployment promotions performed.
- Earlier custom editor: `v1.html` and `src/storymix-v1.mjs`, including recording, Sinhala caption, audio, timeline and restore controls. These **must not be removed** by an incomplete rebuild.
- Independent implementation: `phase1/core-editor-verification` branch, under `next/`.
- The existing `rebuild/editor-foundation` is an experiment, not a release.

## Third-party foundation
- `@elah/editor@0.6.0` and the upstream React sample supply timeline, asset library, preview, element inspector and export UI.
- Upstream `elahlabs/elah` repository `LICENSE` is **Apache-2.0**; package metadata states Apache-2.0.
- Adapted upstream components are attributed in `next/THIRD_PARTY_NOTICES.md`.
- Elah is a modern browser editing SDK, not proof by itself that all StoryMix V1 functionality is ready.

## Implemented in isolated branch
1. Full upstream editor layout (not a reduced bespoke replacement).
2. Media import control using `useMediaLibrary` and `insertMediaAsset`; video's embedded-audio choice is intentionally confirmed in the upstream dialog.
3. Multi-track timeline, trim/split and undo/redo engine; project JSON save/open; Sinhala SRT captions import/export; text properties; resolution presets and export controls.
4. Vite/TypeScript build gate; actual Chromium/Playwright tests generate an H.264/AAC sample and perform import/clip placement/SRT/save/export; FFprobe checks rendered output.

## Actual verification evidence
- Build and core tests pass on prior isolated commits.
- Chromium import and timeline placement with a real H.264/AAC clip **passed**: GitHub Actions run `41097957508`.
- Sinhala SRT import and caption export **passed up to the MP4-export phase** on run `41099434379`.
- **Audio MP4 export failed on GitHub Linux Chromium** in run `41099434379`: `mp4a.40.2, 128000 bps, 2 channels, 44100 Hz` AudioEncoder config unsupported. This is a real release blocker for verified H.264/AAC output, not a UI problem.
- An isolated video-only rendering test is pending; it does **not** waive the audio-export requirement.

## Known gaps before Phase 1 can be called complete
- Verify encoded, playable H.264/AAC MP4 with correct audio/video sync across target browsers. Add a supported audio codec pipeline/fallback if the browser lacks AAC WebCodecs.
- Verify durable project save and **reopen after browser reload**, including local media relinking. Saving `blob:` URLs in JSON is not durable media persistence.
- Verify split/trim/crop/multi-track positioning at browser level, and substantial video samples.
- Compare all previously working `main` features against rebuild before promotion, preserving or reimplementing them.
- Test security/privacy, file size and error-handling limits.
- Do not merge to `main` or deploy new previews without accepted browser workflow tests.

## Release rule
Only promote the **same tested commit** once the full core workflow passes. Build success and appearance alone are not acceptance.
