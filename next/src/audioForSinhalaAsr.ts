import {FFmpeg} from '@ffmpeg/ffmpeg'

export interface AudioSlice{
 sourceStartSeconds:number
 sourceDurationSeconds:number
 signal?:AbortSignal
 onProgress?:(stage:string)=>void
}
const rate=16000

async function resample(
 original:AudioBuffer,
 opts:AudioSlice,
):Promise<Float32Array>{
 if(opts.signal?.aborted)throw new DOMException('Cancelled','AbortError')
 const start=Math.min(original.duration,Math.max(0,opts.sourceStartSeconds))
 const duration=Math.max(0,Math.min(opts.sourceDurationSeconds,original.duration-start))
 if(duration<.1)throw Error('The clip has no usable audio within its trimmed range.')
 const frameCount=Math.max(1,Math.ceil(duration*rate))
 const offline=new OfflineAudioContext(1,frameCount,rate)
 const source=offline.createBufferSource()
 source.buffer=original
 source.connect(offline.destination)
 source.start(0,start,duration)
 const mixed=await offline.startRendering()
 return new Float32Array(mixed.getChannelData(0))
}

async function loadFFmpeg(signal:AbortSignal|undefined):Promise<FFmpeg>{
 const ffmpeg=new FFmpeg()
 signal?.addEventListener('abort',()=>ffmpeg.terminate(),{once:true})
 const resources=await Promise.all([fetch('/ffmpeg/ffmpeg-core.js'),fetch('/ffmpeg/ffmpeg-core.wasm')])
 if(resources.some(r=>!r.ok))throw Error('Local FFmpeg audio decoder is missing.')
 const blobs=await Promise.all(resources.map(r=>r.blob()))
 const jsURL=URL.createObjectURL(new Blob([blobs[0]],{type:'text/javascript'}))
 const wasmURL=URL.createObjectURL(new Blob([blobs[1]],{type:'application/wasm'}))
 try{await ffmpeg.load({coreURL:jsURL,wasmURL})}
 finally{URL.revokeObjectURL(jsURL);URL.revokeObjectURL(wasmURL)}
 return ffmpeg
}

/**
 * Browser AudioContext handles WAV/MP3/Opus where supported.
 * MP4/H.264 containers are unreliable with decodeAudioData, so we fall
 * back to the already bundled local FFmpeg WebAssembly engine. The decoded
 * source is a 16 kHz mono waveform, then sent to a dedicated Whisper worker.
 */
export async function decodeClipForAsr(src:string,options:AudioSlice):Promise<Float32Array>{
 const {signal,onProgress,sourceStartSeconds,sourceDurationSeconds}=options
 if(sourceDurationSeconds<=0||sourceDurationSeconds>1500)throw Error('Select a clip no longer than 25 minutes.')
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError')
 onProgress?.('Reading source media locally…')
 const response=await fetch(src,{signal})
 if(!response.ok)throw Error('Media is unavailable. Relink the source file first.')
 const buffer=await response.arrayBuffer()
 if(buffer.byteLength>350_000_000)throw Error('This media file exceeds the 350 MB browser transcription limit.')
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError')
 let context:AudioContext|undefined
 try{
  context=new AudioContext()
  onProgress?.('Decoding source audio…')
  const original=await context.decodeAudioData(buffer.slice(0))
  const sliced=await resample(original,options)
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError')
  return sliced
 }catch(error){
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError')
  onProgress?.('Decoding video audio using local FFmpeg…')
 }finally{await context?.close().catch(()=>{})}

 let ffmpeg:FFmpeg|undefined
 try{
  ffmpeg=await loadFFmpeg(signal)
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError')
  const input='storymix-caption-media.bin'
  await ffmpeg.writeFile(input,new Uint8Array(buffer))
  const code=await ffmpeg.exec([
   '-hide_banner','-loglevel','error','-y',
   '-ss',String(sourceStartSeconds),'-i',input,
   '-t',String(sourceDurationSeconds),
   '-vn','-ac','1','-ar','16000','-c:a','pcm_s16le','-f','wav',
   'storymix-caption-audio.wav',
  ])
  if(code!==0)throw Error('No decodable audio stream in the selected media.')
  const out=await ffmpeg.readFile('storymix-caption-audio.wav')
  if(typeof out==='string')throw Error('Invalid decoded audio data.')
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError')
  const decodeContext=new AudioContext()
  try{
   const audio=await decodeContext.decodeAudioData(Uint8Array.from(out).buffer)
   return await resample(audio,{...options,sourceStartSeconds:0,sourceDurationSeconds:audio.duration})
  }finally{await decodeContext.close().catch(()=>{})}
 }finally{ffmpeg?.terminate()}
}
