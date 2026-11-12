import type {CaptionSegment} from './sinhalaAsr'

/**
 * Gemini BYOK audio transport. Whisper worker stays installed but unused
 * unless the user explicitly selects "Local Whisper (experimental)".
 *
 * 45-sec chunks each ~1.44 MB, below Vercel's request-body ceiling.
 * One request at a time; no parallel or retry storms against free quotas.
 */
const SAMPLE_RATE=16000
const CHUNK_SECONDS=40
const OVERLAP_SECONDS=1
const MAX_DURATION=25*60

export function wavPcm16(samples:Float32Array):Uint8Array{
 const result=new Uint8Array(44+samples.length*2)
 const view=new DataView(result.buffer)
 const word=(offset:number,text:string)=>{for(let i=0;i<text.length;i++)result[offset+i]=text.charCodeAt(i)}
 word(0,'RIFF');view.setUint32(4,36+samples.length*2,true);word(8,'WAVE')
 word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true)
 view.setUint16(22,1,true);view.setUint32(24,SAMPLE_RATE,true)
 view.setUint32(28,SAMPLE_RATE*2,true);view.setUint16(32,2,true)
 view.setUint16(34,16,true);word(36,'data')
 view.setUint32(40,samples.length*2,true)
 for(let i=0;i<samples.length;i++){
  const clipped=Math.max(-1,Math.min(1,samples[i]))
  view.setInt16(44+i*2,Math.round(clipped<0?clipped*32768:clipped*32767),true)
 }
 return result
}
export function mergeGeminiSegments(
 current:CaptionSegment[],incoming:CaptionSegment[],
):CaptionSegment[]{
 const result=[...current]
 for(const seg of incoming){
  const text=seg.text.normalize('NFC').replace(/\s+/gu,' ').trim()
  if(!text||seg.end<=seg.start)continue
  // Overlap on API call boundaries is expected; discard near-identical
  // captions at the same source time without removing legitimate repetition.
  const duplicate=result.some(old=>
   Math.abs(old.start-seg.start)<1.1&&
   Math.abs(old.end-seg.end)<1.7&&old.text===text
  )
  if(!duplicate)result.push({...seg,text})
 }
 return result.sort((a,b)=>a.start-b.start)
}
export async function transcribeGemini(
 waveform:Float32Array,
 key:string,
 signal:AbortSignal,
 onProgress:(current:number,total:number)=>void,
):Promise<CaptionSegment[]>{
 if(!/^AIza[A-Za-z0-9_-]{25,}$/.test(key.trim()))throw Error('Paste your Google AI Studio API key first.')
 if(waveform.length<1600||waveform.length>MAX_DURATION*SAMPLE_RATE)throw Error('Select audio between 0.1 and 25 minutes.')
 const chunkFrames=CHUNK_SECONDS*SAMPLE_RATE
 const stride=chunkFrames-OVERLAP_SECONDS*SAMPLE_RATE
 const total=Math.max(1,Math.ceil(Math.max(0,waveform.length-chunkFrames)/stride)+1)
 let merged:CaptionSegment[]=[]
 for(let index=0;index<total;index++){
  if(signal.aborted)throw new DOMException('Cancelled','AbortError')
  const start=index*stride
  const end=Math.min(waveform.length,start+chunkFrames)
  const sample=waveform.subarray(start,end)
  const payload=wavPcm16(sample)
  const response=await fetch('/api/transcribe',{
   method:'POST',
   headers:{
    'Content-Type':'audio/wav',
    'x-storymix-gemini-key':key.trim(),
   },
   body:new Blob([payload.buffer as ArrayBuffer],{type:'audio/wav'}),
   signal,
   cache:'no-store',
  })
  const data=await response.json().catch(()=>({error:'Invalid response from transcription service.'})) as {
   error?:string;segments?:Array<{start:number;end:number;text:string}>
  }
  if(!response.ok)throw Error(data.error??'Gemini transcription failed ('+response.status+').')
  const offset=start/SAMPLE_RATE
  const seconds=sample.length/SAMPLE_RATE
  const incoming=(Array.isArray(data.segments)?data.segments:[]).flatMap(seg=>{
   if(!seg||typeof seg.text!=='string')return []
   const a=Number(seg.start),b=Number(seg.end)
   if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return []
   return [{start:offset+Math.max(0,Math.min(seconds,a)),
    end:offset+Math.max(0,Math.min(seconds,b)),text:seg.text}] as CaptionSegment[]
  })
  merged=mergeGeminiSegments(merged,incoming)
  onProgress(index+1,total)
 }
 return merged
}
