/**
 * StoryMix local Sinhala speech recognition adapter.
 * Pure timestamp validation/alignment shared by Worker and editor UI.
 * All times are in seconds until written to the timeline's integer frames.
 */
export interface RecognitionChunk {
  text: string
  start: number
  end: number
}
export interface CaptionSegment {
  start: number
  end: number
  text: string
}

export function cleanRecognition(chunks:unknown,duration:number): CaptionSegment[] {
 if(!Array.isArray(chunks)||!Number.isFinite(duration)||duration<=0)return []
 const input=chunks.flatMap((chunk):CaptionSegment[]=>{
  if(!chunk||typeof chunk!=='object')return []
  const entry=chunk as {text?:unknown;timestamp?:unknown;start?:unknown;end?:unknown}
  const raw=typeof entry.text==='string'?entry.text.replace(/\s+/gu,' ').trim():''
  if(!raw)return []
  const times=Array.isArray(entry.timestamp)?entry.timestamp:[entry.start,entry.end]
  const start=Number(times[0]),end=Number(times[1])
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return []
  const a=Math.min(duration,Math.max(0,start)),b=Math.min(duration,Math.max(0,end))
  return b-a>=0.1?[{start:a,end:b,text:raw.slice(0,600)}]:[]
 })
 return input.sort((a,b)=>a.start-b.start).reduce((out,chunk)=>{
  const prior=out[out.length-1]
  // Whisper can repeat identical partial phrases on chunk boundaries.
  if(prior&&prior.text===chunk.text&&chunk.start<=prior.end+.15){
   prior.end=Math.max(prior.end,chunk.end)
  }else out.push({...chunk})
  return out
 },[] as CaptionSegment[])
}

/**
 * Split overly long sentences while preserving the relative time axis.
 * Preserve at least 0.25 seconds per caption and avoid blank captions.
 */
export function splitLongCaptions(segments:CaptionSegment[],maxSeconds=6):CaptionSegment[]{
 const result:CaptionSegment[]=[]
 for(const seg of segments){
  const span=seg.end-seg.start
  if(span<=maxSeconds){result.push(seg);continue}
  const words=seg.text.split(/\s+/u).filter(Boolean)
  if(words.length<2){
   result.push(seg)
   continue
  }
  const pieces=Math.max(1,Math.ceil(span/maxSeconds))
  const groupSize=Math.ceil(words.length/pieces)
  for(let i=0;i<words.length;i+=groupSize){
   const from=i/words.length,to=Math.min(words.length,i+groupSize)/words.length
   result.push({start:seg.start+span*from,end:seg.start+span*to,text:words.slice(i,i+groupSize).join(' ')})
  }
 }
 return result.filter(s=>s.end-s.start>=.1&&s.text.length>0)
}

/**
 * The selected media can be placed far into the project, cut to a source in
 * point, or sped up. Keep the caption's timeline time separate from the
 * source-time timestamps reported by Whisper.
 */
export function sourceSecondsToTimelineFrame(
 sourceRelativeSeconds:number,
 clipStartFrame:number,
 speed:number,
 fps=30,
):number{
 return Math.max(0,Math.round(clipStartFrame+(Math.max(0,sourceRelativeSeconds)/Math.max(.25,speed))*fps))
}
