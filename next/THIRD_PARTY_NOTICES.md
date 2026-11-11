# Third-party notices
StoryMix editor rebuild uses `@elah/editor` and adapts `TextClipProperties.tsx` and `theme.ts` from [Elah](https://github.com/elahlabs/elah), licensed under Apache License 2.0.
Copyright remains with respective upstream authors. Refer to the upstream license and NOTICE (if provided) for attribution and redistribution conditions.
This rebuild is a preview, not a finalized replacement for the current StoryMix app.

## FFmpeg WebAssembly fallback

The optional AAC MP4 export fallback uses:
- `@ffmpeg/ffmpeg` 0.12.15, `@ffmpeg/core` 0.12.10
- Source and build instructions: https://github.com/ffmpegwasm/ffmpeg.wasm
- FFmpeg source: https://ffmpeg.org/download.html
- Licensing: `@ffmpeg/core` browser binary is licensed GPL-2.0-or-later according to its npm package metadata. Distribution of this binary may require corresponding source availability and compliance with GPL terms. Confirm license obligations before public distribution.
- Relevant H.264/AAC encoding may also have patent licensing considerations.

The FFmpeg core assets are delivered from the same site. Users' media files remain in the browser during this fallback; they are not uploaded by the encoder.

## Sinhala caption font

Noto Sans Sinhala font (self-hosted via `@fontsource/noto-sans-sinhala` 5.3.0) is Copyright The Noto Project Authors and licensed under SIL Open Font License 1.1. Preserve the accompanying font license and attribution in any redistributions. https://github.com/notofonts/sinhala
