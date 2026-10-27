# StoryMix — Existing editor foundation evaluation

## Decision in progress
Stop expanding the single-file bespoke browser editor as the long-term engine. Preserve current production until a replacement has passed working import → timeline → export tests.

## Candidate A: FilmCraft (MIT or Apache-2.0; verify license notices)
- Mature-looking Rust/Cargo non-linear editing architecture; upstream says native + wasm.
- Check with upstream Cargo build and project CI before assuming its engine can embed into StoryMix's browser UI.
- Do **not** copy its entire desktop front-end and claim it is a working Vercel web editor.
- Confirm browser-compatible engine entry points, wasm binary size, actual browser decoding and rendering, and codec/platform restrictions.
- Prefer using unmodified core crates or their documented APIs, with attribution.

## Candidate B: OpenReelio (MIT)
- React frontend, Rust/Tauri desktop backend, FFmpeg export.
- Frontend code may be reusable; native Tauri commands cannot simply run on static Vercel hosting.
- Useful for timeline UX and project data structures; requires a browser rendering replacement or a native desktop product.
- Early-stage software, not assumed to be production-tested.

## Browser fallback
- React/Vite for UI; rely on documented ffmpeg.wasm, WebCodecs and audio APIs rather than a homegrown codec.
- FFmpeg.wasm CPU limitations and cross-origin isolation requirements must be measured.
- No external editor of unknown/no license may be vendored or redistributed as proprietary StoryMix code.

## Release gate (must pass)
1. Real phone MP4 + WebM imported in Chrome/Edge.
2. Split, trim, rearrange, 2 video + 2 audio tracks, save and reopen.
3. Sinhala Unicode captions persist and appear in exported output.
4. Export H.264/AAC MP4, check A/V sync, cuts and duration against input.
5. Export large source within realistic memory/performance constraints, and give explicit failure message.
6. Test Windows desktop path separately from browser path.

## Execution rules
- Prototype candidate on `rebuild/editor-foundation` only.
- Only replace production when working UI, library licenses, benchmark/test evidence and export pass.
- Keep previous `main` and Vercel deployment available for rollback.
- Do not mark V1 Final based only on CI build success.
