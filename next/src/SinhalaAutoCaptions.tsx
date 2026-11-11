import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react'
import {WandSparkles,AudioLines,Square,Download,Check,AlertTriangle} from 'lucide-react'
import {useSelectionStore,useTimelineEngine,useTracksStore,type Clip} from '@elah/editor'
import {decodeClipForAsr} from './audioForSinhalaAsr'
import {sourceSecondsToTimelineFrame,type CaptionSegment} from './sinhalaAsr'
import {writeSrt} from './subtitles'

interface EventData {
 type:'progress'|'caption'|'complete'|'error'
 stage?:string
 percent?:number
 finished?:number
 total?:number
 chunk?:CaptionSegment
 message?:string
 model?:string
}
type State='idle'|'decoding'|'loading'|'transcribing'|'review'|'error'
const card:CSSProperties={border:'1px solid #344e62',borderRadius:9,background:'#132638',padding:11}
const btn:CSSProperties={border:'1px solid #365b73',borderRadius:7,padding:'8px 10px',background:'#173449',color:'#e2f3fc',cursor:'pointer'}
const input:CSSProperties={width:'100%',background:'#0d2030',color:'#e9f7ff',border:'1px solid #375368',borderRadius:7,padding:'9px',fontSize:12,fontFamily:'Noto Sans Sinhala, Inter, sans-serif'}
const desc:CSSProperties={fontSize:11,lineHeight:1.6,color:'#a1bccd'}
const modelOptions=[
 {value:'sinhala',label:'Sinhala-tuned Whisper Small (recommended)'},
 {value:'multilingual',label:'Multilingual Whisper Base (fallback)'},
] as const
const FPS=30

function downloadableText(filename:string,text:string){
 const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}))
 const a=document.createElement('a')
 a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove()
 setTimeout(()=>URL.revokeObjectURL(url),15000)
}

/** Caption draft editing, model load, and inference are all browser-only. */
export function SinhalaAutoCaptions(){
 const engine=useTimelineEngine()
 const clips=useTracksStore(s=>s.clips)
 const selected=useSelectionStore(s=>s.selectedClipIds)
 const sources=useMemo(()=>Object.values(clips).flat().filter(c=>(c.type==='audio'||c.type==='video')&&typeof c.src==='string'&&c.src.length>0),[clips])
 const defaultId=sources.find(c=>selected.has(c.id))?.id??sources[0]?.id??''
 const [sourceId,setSourceId]=useState('')
 const activeId=sourceId&&sources.some(c=>c.id===sourceId)?sourceId:defaultId
 const clip=sources.find(c=>c.id===activeId)
 const [model,setModel]=useState<'sinhala'|'multilingual'>('sinhala')
 const [preferGpu,setPreferGpu]=useState(false)
 const [state,setState]=useState<State>('idle')
 const [stage,setStage]=useState('Ready')
 const [progress,setProgress]=useState<number|null>(null)
 const [results,setResults]=useState<CaptionSegment[]>([])
 const [error,setError]=useState('')
 const [modelUsed,setModelUsed]=useState('')
 const running=useRef<{worker:Worker|null;controller:AbortController}|null>(null)
 const currentSource=useRef<string|null>(null)
 useEffect(()=>()=>{running.current?.controller.abort();running.current?.worker?.terminate();running.current=null},[])
 const stop=()=>{
  const run=running.current
  running.current=null
  run?.controller.abort()
  run?.worker?.terminate()
  setState('idle');setStage('Cancelled');setProgress(null)
 }
 const run=async()=>{
  if(!clip||running.current)return
  if(clip.type==='video'&&clip.embeddedAudio===false){setError('This video has detached audio. Select its linked audio clip instead.');setState('error');return}
  if(!clip.src){setError('Original source file is unavailable. Relink your media first.');setState('error');return}
  const duration=clip.durationFrames/FPS*(clip.speed??1)
  if(duration<=0||duration>1500){setError('Select a clip shorter than 25 minutes. You can split longer clips first.');setState('error');return}
  const controller=new AbortController()
  running.current={controller,worker:null}
  currentSource.current=clip.id
  setResults([]);setError('');setModelUsed('');setProgress(null)
  setState('decoding');setStage('Preparing audio…')
  try{
   const waveform=await decodeClipForAsr(clip.src,{
    sourceStartSeconds:clip.sourceStartFrame/FPS,
    sourceDurationSeconds:duration,
    signal:controller.signal,
    onProgress:message=>{if(!controller.signal.aborted)setStage(message)},
   })
   if(controller.signal.aborted)return
   setState('loading')
   setStage('Downloading model on first use; subsequent runs use browser cache…')
   const worker=new Worker(new URL('./sinhalaAsr.worker.ts',import.meta.url),{type:'module'})
   if(!running.current||running.current.controller!==controller){worker.terminate();return}
   running.current.worker=worker
   const draft:CaptionSegment[]=[]
   worker.onmessage=(event:MessageEvent<EventData>)=>{
    if(controller.signal.aborted||!running.current||running.current.controller!==controller)return
    const data=event.data
    if(data.type==='progress'){
     if(data.stage)setStage(data.stage)
     if(data.percent!==undefined)setProgress(data.percent)
     if(data.finished!==undefined){
      setState('transcribing')
      setStage('Transcribing Sinhala… '+data.finished+' / '+data.total+' audio chunks')
     }
    }else if(data.type==='caption'&&data.chunk){
     draft.push(data.chunk)
     setResults([...draft])
    }else if(data.type==='complete'){
     running.current=null;worker.terminate()
     setModelUsed(data.model??model)
     setState('review')
     setStage(draft.length?'Review the generated captions before inserting.':'No speech detected. Try a clearer source or the multilingual model.')
     setProgress(100)
    }else if(data.type==='error'){
     running.current=null;worker.terminate()
     setError(data.message??'The recognizer failed.')
     setState('error');setProgress(null)
    }
   }
   worker.onerror=(event)=>{
    if(controller.signal.aborted)return
    event.preventDefault()
    worker.terminate();running.current=null
    setError('Speech model worker failed. Confirm that model downloads are allowed, and try CPU processing.')
    setState('error')
   }
   worker.postMessage({
    type:'start',buffer:waveform.buffer,length:waveform.length,sampleRate:16000,model,preferGpu,
   },[waveform.buffer])
  }catch(err){
   if(!controller.signal.aborted){
    setError(err instanceof Error?err.message:String(err));setState('error')
   }
   if(running.current?.controller===controller){
    running.current.worker?.terminate();running.current=null
   }
  }
 }
 const edit=(index:number,patch:Partial<CaptionSegment>)=>setResults(rows=>rows.map((s,i)=>i===index?{...s,...patch}:s))
 const timeline=(segment:CaptionSegment,source:Clip)=>{
  const speed=source.speed??1
  const max=source.startFrame+source.durationFrames
  const start=sourceSecondsToTimelineFrame(segment.start,source.startFrame,speed)
  const end=Math.min(max,sourceSecondsToTimelineFrame(segment.end,source.startFrame,speed))
  return {startFrame:start,durationFrames:Math.max(1,end-start)}
 }
 const commit=()=>{
  const target=engine.findClip(currentSource.current??'')?.clip
  if(!target){setError('The original clip was removed. Generate captions again.');setState('error');return}
  const ordered=[...results].filter(s=>s.text.trim()&&s.end>s.start).sort((a,b)=>a.start-b.start)
  if(!ordered.length){setError('No usable caption lines to insert.');setState('error');return}
  let count=0
  try{
   engine.batch(()=>{
    const track=engine.addTrack('elements',{name:'AI Captions — Sinhala'})
    let last=target.startFrame
    for(const segment of ordered){
     const times=timeline(segment,target)
     const start=Math.max(last,times.startFrame)
     const end=Math.min(target.startFrame+target.durationFrames,times.startFrame+times.durationFrames)
     if(end<=start)continue
     const added=engine.addClip({type:'text',trackId:track.id,name:'AI Caption',startFrame:start,durationFrames:end-start,
      text:{content:segment.text.trim(),fontSize:52,color:'#ffffff',fontFamily:'Noto Sans Sinhala',textAlign:'center'}})
     engine.updateClip(added.id,track.id,{
      textOutline:{color:'#08121d',width:4},textShadow:{color:'#000000',blur:8,offsetX:1,offsetY:3},
     })
     last=end;count++
    }
   },'Generate Sinhala AI captions')
   setStage('Inserted '+count+' editable Sinhala captions. Correct text and timing in the timeline; export SRT or MP4 as usual.')
   setState('idle')
  }catch(err){setError('Could not insert captions: '+String(err));setState('error')}
 }
 const exportSrt=()=>{
  if(!clip||!results.length)return
  const rows=results.filter(r=>r.text.trim()).map(row=>{
   const t=timeline(row,clip)
   return {start:t.startFrame/FPS,end:(t.startFrame+t.durationFrames)/FPS,text:row.text.trim()}
  })
  downloadableText('StoryMix-Sinhala-Auto-Captions.srt',writeSrt(rows))
 }
 const processing=state==='decoding'||state==='loading'||state==='transcribing'
 const seconds=clip?.durationFrames?clip.durationFrames/FPS:0
 return <section aria-label="Sinhala AI Auto Captions" style={{...card,display:'grid',gap:10}}>
  <div style={{display:'flex',gap:8,alignItems:'center',fontSize:12,fontWeight:700,color:'#a4e9ff'}}>
   <WandSparkles size={17}/> Sinhala AI Auto Captions
  </div>
  <p style={{...desc,margin:0}}>Turn spoken Sinhala into editable, timed captions using on-device Whisper. Audio stays in your browser. First use downloads a large speech model from Hugging Face.</p>
  <label style={{display:'grid',gap:5,fontSize:11}}>Source video or audio
   <select aria-label="Auto captions media source" style={input} value={activeId} disabled={processing} onChange={e=>setSourceId(e.target.value)}>
    {!sources.length&&<option value="">Import video or audio first</option>}
    {sources.map(c=><option key={c.id} value={c.id}>{c.name} · {c.type} · {(c.durationFrames/FPS).toFixed(1)}s</option>)}
   </select>
  </label>
  <label style={{display:'grid',gap:5,fontSize:11}}>Recognition model
   <select aria-label="Sinhala transcription model" style={input} value={model} disabled={processing} onChange={e=>setModel(e.target.value as typeof model)}>
    {modelOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
   </select>
  </label>
  <label style={{display:'flex',gap:7,alignItems:'center',fontSize:11,color:'#b6ccdb'}}>
   <input aria-label="Use GPU for Sinhala captions" type="checkbox" disabled={processing} checked={preferGpu} onChange={e=>setPreferGpu(e.target.checked)}/>
   Try WebGPU acceleration (requires compatible browser/GPU)
  </label>
  <div style={{display:'flex',gap:7}}>
   <button type="button" aria-label="Generate Sinhala AI captions" onClick={()=>void run()} disabled={processing||!clip}
    style={{...btn,flex:1,display:'flex',gap:7,justifyContent:'center',alignItems:'center',background:'#095472',borderColor:'#167ea4',opacity:processing||!clip?.55:1}}>
    <AudioLines size={16}/> Generate captions
   </button>
   {processing&&<button type="button" aria-label="Cancel Sinhala transcription" onClick={stop} style={btn}><Square size={15}/></button>}
  </div>
  {(processing||state==='review')&&<div style={{display:'grid',gap:5}}>
   <div style={{height:5,borderRadius:4,background:'#233b50',overflow:'hidden'}}>
    <div style={{width:(progress??2)+'%',height:'100%',background:'#16b9f5',transition:'width .2s'}}/>
   </div>
   <span style={desc} role="status">{stage} {progress!==null?progress+'%':''}</span>
  </div>}
  {state==='error'&&<div role="alert" style={{...desc,color:'#ffbdbd',display:'flex',gap:6}}><AlertTriangle size={15}/>{error}</div>}
  {results.length>0&&<div style={{display:'grid',gap:8}}>
   <strong style={{fontSize:11,color:'#9de8ff'}}>REVIEW CAPTIONS ({results.length})</strong>
   <div style={{maxHeight:260,overflowY:'auto',display:'grid',gap:6}}>
    {results.map((row,index)=><div key={index} style={{...card,padding:7,display:'grid',gap:5}}>
     <div style={{display:'flex',gap:5,alignItems:'center'}}>
      <input aria-label={'Caption '+(index+1)+' start time'} title="Start (seconds within selected clip)" type="number" step=".1" min={0}
       value={Number(row.start.toFixed(2))} onChange={e=>edit(index,{start:Math.max(0,Number(e.target.value)||0)})} style={{...input,width:'50%',padding:5}}/>
      <input aria-label={'Caption '+(index+1)+' end time'} title="End (seconds within selected clip)" type="number" step=".1" min={0}
       value={Number(row.end.toFixed(2))} onChange={e=>edit(index,{end:Math.max(0,Number(e.target.value)||0)})} style={{...input,width:'50%',padding:5}}/>
     </div>
     <textarea aria-label={'Caption '+(index+1)+' text'} rows={2} value={row.text} onChange={e=>edit(index,{text:e.target.value})} style={{...input,resize:'vertical',padding:7}}/>
    </div>)}
   </div>
   {state==='review'&&<div style={{display:'grid',gap:7}}>
    <button type="button" aria-label="Insert generated captions into timeline" onClick={commit} style={{...btn,background:'#095472',display:'flex',justifyContent:'center',gap:6}}><Check size={15}/> Add {results.length} captions to timeline</button>
    <button type="button" aria-label="Download generated Sinhala SRT" onClick={exportSrt} style={{...btn,display:'flex',justifyContent:'center',gap:6}}><Download size={15}/> Export Sinhala SRT</button>
   </div>}
  </div>}
  {state==='idle'&&stage.includes('Inserted')&&<output role="status" style={{...desc,color:'#9bdff5'}}>{stage}</output>}
  {modelUsed&&<small style={{color:'#7e9eb5',fontSize:10}}>Model: {modelUsed}</small>}
  <small style={{...desc,fontSize:10}}>Requires initial internet model download. Accuracy depends on recording quality and dialect; always review generated Sinhala text. No paid API key required.</small>
 </section>
}
