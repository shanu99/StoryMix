import type { Project, ExportOptions } from '@elah/editor';

/**
 * Browser AAC fallback.
 *
 * Elah renders and mixes the complete timeline (including captions, video
 * effects and audio tracks) to WebM/VP8+Opus. The unmodified, locally served
 * FFmpeg wasm single-thread core converts that entire timeline into an
 * H.264/AAC MP4. No uploading user footage to a server.
 *
 * The worker is intentionally constructed per export and terminated on
 * completion or cancellation, releasing its substantial WebAssembly memory.
 */
export async function exportMp4WithWasm(
  project: Project,
  opts: ExportOptions,
): Promise<Blob> {
  if (opts.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
  const { lazyExportVideo } = await import('@elah/editor');
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');

  // Opus and VP8 are supported by Chromium's WebCodecs where AAC is absent.
  const webm = await lazyExportVideo(project, {
    ...opts,
    container: 'webm',
    videoCodec: 'vp8',
    audioCodec: 'opus',
  });
  if (opts.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');

  const ffmpeg = new FFmpeg();
  const onAbort = () => ffmpeg.terminate();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    await ffmpeg.load({
      coreURL: '/ffmpeg/ffmpeg-core.js',
      wasmURL: '/ffmpeg/ffmpeg-core.wasm',
    });
    if (opts.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    await ffmpeg.writeFile('storymix-input.webm', new Uint8Array(await webm.arrayBuffer()));
    // x264 output is broadly playable. AAC in FFmpeg wasm does not depend on
    // system WebCodecs AudioEncoder availability.
    const exitCode = await ffmpeg.exec([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', 'storymix-input.webm',
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
      '-movflags', '+faststart',
      'storymix-output.mp4',
    ]);
    if (opts.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    if (exitCode !== 0) throw new Error('FFmpeg MP4 conversion failed (exit '+exitCode+')');
    const output = await ffmpeg.readFile('storymix-output.mp4');
    if (typeof output === 'string') throw new Error('FFmpeg returned invalid MP4 bytes');
    const bytes = Uint8Array.from(output);
    if (bytes.byteLength < 1024) throw new Error('FFmpeg produced an empty MP4 file');
    return new Blob([bytes], { type: 'video/mp4' });
  } catch (error) {
    if (opts.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    throw error;
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
    ffmpeg.terminate();
  }
}
